import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController — /auth/me', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, 'login' | 'getProfile'>>;

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      getProfile: jest.fn(),
    };
    controller = new AuthController(authService as any);
  });

  function createMockRequest(user: any) {
    return { user } as any;
  }

  it('should return the user profile from req.user (no second DB call)', async () => {
    const req = createMockRequest({
      userId: 42,
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'SUPER_ADMIN',
      companyId: 1,
      company: { id: 1, name: 'TestCo', slug: 'testco' },
    });

    const result = await controller.getProfile(req);

    expect(result).toEqual({
      id: 42,
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'SUPER_ADMIN',
      companyId: 1,
      company: { id: 1, name: 'TestCo', slug: 'testco' },
    });

    expect(authService.getProfile).not.toHaveBeenCalled();
  });

  it('should accept ADMIN role', async () => {
    const req = createMockRequest({
      userId: 1,
      name: 'Admin',
      email: 'a@t.com',
      role: 'ADMIN',
      companyId: null,
      company: null,
    });

    const result = await controller.getProfile(req);
    expect(result.role).toBe('ADMIN');
  });

  it('should accept COMPANY_VIEWER role', async () => {
    const req = createMockRequest({
      userId: 2,
      name: 'Viewer',
      email: 'v@t.com',
      role: 'COMPANY_VIEWER',
      companyId: 5,
      company: { id: 5, name: 'Co', slug: 'co' },
    });

    const result = await controller.getProfile(req);
    expect(result.role).toBe('COMPANY_VIEWER');
  });

  it('should reject non-admin roles', () => {
    const req = createMockRequest({
      userId: 3,
      name: 'Bad',
      email: 'b@t.com',
      role: 'CUSTOMER',
      companyId: null,
      company: null,
    });

    expect(() => controller.getProfile(req)).toThrow(ForbiddenException);
  });

  it('should map userId → id in response', async () => {
    const req = createMockRequest({
      userId: 99,
      name: 'Map',
      email: 'm@t.com',
      role: 'ADMIN',
      companyId: null,
      company: null,
    });

    const result = await controller.getProfile(req);
    expect(result.id).toBe(99);
    expect((result as any).userId).toBeUndefined();
  });

  it('should preserve all fields from req.user in response', async () => {
    const req = createMockRequest({
      userId: 7,
      name: 'Full',
      email: 'full@t.com',
      role: 'SUPER_ADMIN',
      companyId: 10,
      company: { id: 10, name: 'FullCo', slug: 'fullco' },
    });

    const result = await controller.getProfile(req);

    expect(result).toHaveProperty('id', 7);
    expect(result).toHaveProperty('name', 'Full');
    expect(result).toHaveProperty('email', 'full@t.com');
    expect(result).toHaveProperty('role', 'SUPER_ADMIN');
    expect(result).toHaveProperty('companyId', 10);
    expect(result).toHaveProperty('company');
    expect(result.company).toEqual({ id: 10, name: 'FullCo', slug: 'fullco' });
  });
});
