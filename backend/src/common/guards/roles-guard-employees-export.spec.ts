import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard — Employee Export Authorization', () => {
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

  function mockContext(requiredRoles: string[] | null | undefined, userRole: string) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requiredRoles);
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: userRole } }),
      }),
    } as any;
  }

  describe('when endpoint requires SUPER_ADMIN and COMPANY_VIEWER', () => {
    const EXPORT_ROLES = ['SUPER_ADMIN', 'COMPANY_VIEWER'];

    it('should allow SUPER_ADMIN', () => {
      const ctx = mockContext(EXPORT_ROLES, 'SUPER_ADMIN');
      // SUPER_ADMIN bypasses explicit role check (RolesGuard line 22-24)
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow COMPANY_VIEWER', () => {
      const ctx = mockContext(EXPORT_ROLES, 'COMPANY_VIEWER');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should NOT allow ADMIN (excluded from required roles)', () => {
      const ctx = mockContext(EXPORT_ROLES, 'ADMIN');
      // ADMIN is SUPER_ADMIN=false, and not in the explicit list
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('should NOT allow unauthenticated users', () => {
      const ctx = mockContext(EXPORT_ROLES, 'ANONYMOUS');
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('should NOT allow users with no role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(EXPORT_ROLES);
      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({ user: null }),
        }),
      } as any;
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('should NOT allow users with undefined role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(EXPORT_ROLES);
      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({ user: {} }),
        }),
      } as any;
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  describe('when list endpoint requires all three roles', () => {
    const LIST_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER'];

    it('should allow SUPER_ADMIN (bypass)', () => {
      const ctx = mockContext(LIST_ROLES, 'SUPER_ADMIN');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow ADMIN (explicit)', () => {
      const ctx = mockContext(LIST_ROLES, 'ADMIN');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow COMPANY_VIEWER (explicit)', () => {
      const ctx = mockContext(LIST_ROLES, 'COMPANY_VIEWER');
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('when no roles specified', () => {
    it('should allow any user (open endpoint fallback)', () => {
      const ctx = mockContext(undefined, 'ANONYMOUS');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow with empty roles array', () => {
      const ctx = mockContext([], 'ANONYMOUS');
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
