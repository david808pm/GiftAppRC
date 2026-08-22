import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import {
  extractFiles,
  GIFT_IMPORT_FILE_FILTER,
} from './gift-import.admin.controller';
import { pngBytes } from './test-utils';

function file(fieldname: string, originalname = 'x.xlsx'): Express.Multer.File {
  return {
    buffer: pngBytes(16),
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    fieldname,
    size: 16,
  } as unknown as Express.Multer.File;
}

describe('extractFiles — multipart field cardinality', () => {
  it('accepts exactly one excel and one zip', () => {
    const res = extractFiles({ excel: [file('excel')], zip: [file('zip')] });
    expect(res.excel.fieldname).toBe('excel');
    expect(res.zip.fieldname).toBe('zip');
  });

  it('duplicate excel field is rejected', () => {
    expect(() =>
      extractFiles({ excel: [file('excel'), file('excel')], zip: [file('zip')] }),
    ).toThrow(BadRequestException);
  });

  it('duplicate zip field is rejected', () => {
    expect(() =>
      extractFiles({ excel: [file('excel')], zip: [file('zip'), file('zip')] }),
    ).toThrow(BadRequestException);
  });

  it('missing zip field is rejected', () => {
    expect(() => extractFiles({ excel: [file('excel')] })).toThrow(
      BadRequestException,
    );
  });

  it('zero files in a declared field is rejected', () => {
    expect(() => extractFiles({ excel: [], zip: [file('zip')] })).toThrow(
      BadRequestException,
    );
  });

  it('returns exactly the excel and zip files (extra fields are not smuggled)', () => {
    const res = extractFiles({
      excel: [file('excel')],
      zip: [file('zip')],
      other: [file('other', 'evil.sh')],
    } as any);
    expect(res.excel.originalname).toBe('x.xlsx');
    expect(res.zip.originalname).toBe('x.xlsx');
  });
});

describe('GIFT_IMPORT_FILE_FILTER — unknown/extra file fields', () => {
  it('rejects any field that is not excel or zip', () => {
    const cb = jest.fn();
    GIFT_IMPORT_FILE_FILTER({} as any, file('script.sh', 'evil.sh'), cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const [err, accept] = cb.mock.calls[0];
    expect(err).toBeInstanceOf(BadRequestException);
    expect(accept).toBe(false);
  });

  it('accepts excel and zip fields', () => {
    const cb = jest.fn();
    GIFT_IMPORT_FILE_FILTER({} as any, file('excel'), cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});
