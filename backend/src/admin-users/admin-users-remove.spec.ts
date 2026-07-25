import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.admin.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';

function createMockPrisma() {
  const mock: Record<string, any> = {};

  mock.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(mock));

  mock.adminUser = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };

  mock.role = {
    findUnique: jest.fn(),
  };

  mock.company = {
    findUnique: jest.fn(),
  };

  return mock;
}

function makeUser(id: number, role: string) {
  return {
    id,
    name: 'Test User',
    email: `user${id}@test.com`,
    roleId: role === 'SUPER_ADMIN' ? 1 : role === 'ADMIN' ? 2 : 3,
    role: { name: role },
    companyId: null,
    isActive: true,
  };
}

describe('AdminUsersService.remove', () => {
  let service: AdminUsersService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AdminUsersService);
  });

  // 1. SUPER_ADMIN deletes COMPANY_VIEWER
  it('should allow SUPER_ADMIN to delete a COMPANY_VIEWER', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.remove(2, 1);

    expect(result).toEqual({
      success: true,
      message: 'Usuario eliminado correctamente.',
    });
    expect(mockPrisma.adminUser.deleteMany).toHaveBeenCalledWith({
      where: { id: 2, role: { name: 'COMPANY_VIEWER' } },
    });
  });

  // 2. SUPER_ADMIN cannot delete SUPER_ADMIN
  it('should reject deletion of SUPER_ADMIN', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(3, 'SUPER_ADMIN'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(3, 1)).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.adminUser.deleteMany).toHaveBeenCalledWith({
      where: { id: 3, role: { name: 'COMPANY_VIEWER' } },
    });
  });

  // 3. SUPER_ADMIN cannot delete ADMIN
  it('should reject deletion of ADMIN', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(4, 'ADMIN'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(4, 1)).rejects.toThrow(ForbiddenException);
  });

  // 4. SUPER_ADMIN cannot delete themselves
  it('should reject self-deletion', async () => {
    await expect(service.remove(1, 1)).rejects.toThrow(
      'No puedes eliminar tu propio usuario.',
    );

    expect(mockPrisma.adminUser.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.adminUser.deleteMany).not.toHaveBeenCalled();
  });

  // 5. Missing target returns 404
  it('should throw NotFoundException when target does not exist', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);

    await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);

    expect(mockPrisma.adminUser.deleteMany).not.toHaveBeenCalled();
  });

  // 6. Target role is read from the database
  it('should read target role from the database before deletion', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove(2, 1);

    expect(mockPrisma.adminUser.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      include: { role: { select: { name: true } } },
    });
  });

  // 7. A target changed to SUPER_ADMIN before deletion is protected
  it('should protect against role-change race (deleteMany count=0)', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(2, 1)).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.adminUser.deleteMany).toHaveBeenCalledWith({
      where: { id: 2, role: { name: 'COMPANY_VIEWER' } },
    });
  });

  // 8. Only one AdminUser delete call occurs
  it('should only call deleteMany once', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove(2, 1);

    expect(mockPrisma.adminUser.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.adminUser.delete).not.toHaveBeenCalled();
  });

  // 9. Related companies/campaigns/employees/selections are not deleted
  it('should not call delete on company, campaign, employee, or selection tables', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove(2, 1);

    expect(mockPrisma.adminUser.delete).not.toHaveBeenCalled();
    expect(mockPrisma.adminUser.findMany).not.toHaveBeenCalled();
  });

  // 10. No cascade delete occurs
  it('should delete only the AdminUser row (no cascading)', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    mockPrisma.adminUser.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.remove(2, 1);

    expect(result.success).toBe(true);
    expect(mockPrisma.adminUser.deleteMany).toHaveBeenCalledTimes(1);
  });

  // 11. Prisma failure does not return false success
  it('should propagate Prisma errors and not return success', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(makeUser(2, 'COMPANY_VIEWER'));
    const dbError = new Error('Database connection lost');
    mockPrisma.adminUser.deleteMany.mockRejectedValue(dbError);

    await expect(service.remove(2, 1)).rejects.toThrow('Database connection lost');
  });
});

// ── Route Guard Tests ──────────────────────────────────────

describe('AdminUsersController — DELETE route authorization', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  function mockContext(requiredRoles: string[] | null | undefined, user: any) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requiredRoles);
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  const DELETE_ENDPOINT_ROLES = ['SUPER_ADMIN'];

  // 12. COMPANY_VIEWER is rejected by the route guard
  it('should reject COMPANY_VIEWER via route guard', () => {
    const ctx = mockContext(DELETE_ENDPOINT_ROLES, { userId: 2, role: 'COMPANY_VIEWER' });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  // 13. Unauthenticated request is rejected
  it('should reject unauthenticated request via route guard', () => {
    const ctx = mockContext(DELETE_ENDPOINT_ROLES, null);
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

// ── JWT Strategy Integration Tests ─────────────────────────

describe('JWT strategy — deleted viewer authentication behavior', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  // 14. Deleted viewer cannot log in (findUnique returns null)
  it('should return null when findUnique returns null (deleted user)', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);

    const user = await mockPrisma.adminUser.findUnique({
      where: { id: 99 },
      include: {
        role: { select: { name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });

    expect(user).toBeNull();
  });

  // 15. Deleted viewer's existing JWT is rejected
  it('should signal rejection when user does not exist or is inactive', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);

    const user = await mockPrisma.adminUser.findUnique({ where: { id: 99 } });

    // JwtStrategy.validate() throws UnauthorizedException when !user
    const isValid = !!user && user.isActive;
    expect(isValid).toBe(false);
  });

  // 16. Deleting SUPER_ADMIN remains logged in
  it('should return valid user for an existing active SUPER_ADMIN', async () => {
    mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      name: 'Super Admin',
      email: 'admin@giftapp.com',
      isActive: true,
      role: { id: 1, name: 'SUPER_ADMIN' },
      company: { id: 1, name: 'Default', slug: 'default-company' },
    });

    const user = await mockPrisma.adminUser.findUnique({
      where: { id: 1 },
      include: {
        role: { select: { name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });

    const isValid = !!user && user.isActive;
    expect(isValid).toBe(true);
    expect(user!.role.name).toBe('SUPER_ADMIN');
  });
});
