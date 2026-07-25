import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { BeneficiaryQueryDto } from '../beneficiaries/dto/beneficiary-query.dto';
import { SelectionQueryDto } from '../selections/dto/selection-query.dto';

async function validateDto<T extends object>(
  dtoClass: new () => T,
  plain: Record<string, any>,
): Promise<string[]> {
  const instance = plainToInstance(dtoClass, plain);
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints || {}));
}

describe('Pagination DTO — pageSize @Max(100)', () => {
  // ── EmployeeQueryDto ───────────────────────────────────

  describe('EmployeeQueryDto', () => {
    it('should accept pageSize=25', async () => {
      const errors = await validateDto(EmployeeQueryDto, { page: 1, pageSize: 25 });
      expect(errors).toHaveLength(0);
    });

    it('should accept pageSize=50', async () => {
      const errors = await validateDto(EmployeeQueryDto, { page: 1, pageSize: 50 });
      expect(errors).toHaveLength(0);
    });

    it('should accept pageSize=100', async () => {
      const errors = await validateDto(EmployeeQueryDto, { page: 1, pageSize: 100 });
      expect(errors).toHaveLength(0);
    });

    it('should reject pageSize=101', async () => {
      const errors = await validateDto(EmployeeQueryDto, { page: 1, pageSize: 101 });
      expect(errors.some((e) => e.includes('100'))).toBe(true);
    });

    it('should allow omitted page and pageSize', async () => {
      const errors = await validateDto(EmployeeQueryDto, { search: 'test' });
      expect(errors).toHaveLength(0);
    });
  });

  // ── BeneficiaryQueryDto ────────────────────────────────

  describe('BeneficiaryQueryDto', () => {
    it('should accept pageSize=100', async () => {
      const errors = await validateDto(BeneficiaryQueryDto, { page: 1, pageSize: 100 });
      expect(errors).toHaveLength(0);
    });

    it('should reject pageSize=101', async () => {
      const errors = await validateDto(BeneficiaryQueryDto, { page: 1, pageSize: 101 });
      expect(errors.some((e) => e.includes('100'))).toBe(true);
    });
  });

  // ── SelectionQueryDto ──────────────────────────────────

  describe('SelectionQueryDto', () => {
    it('should accept pageSize=100', async () => {
      const errors = await validateDto(SelectionQueryDto, { page: 1, pageSize: 100 });
      expect(errors).toHaveLength(0);
    });

    it('should reject pageSize=101', async () => {
      const errors = await validateDto(SelectionQueryDto, { page: 1, pageSize: 101 });
      expect(errors.some((e) => e.includes('100'))).toBe(true);
    });
  });
});
