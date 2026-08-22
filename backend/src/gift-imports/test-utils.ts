import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { GIFT_TEMPLATE_HEADERS } from './gift-import-validation';

/** Spanish canonical headers used by the template and tests. */
export const GIFT_HEADERS = [...GIFT_TEMPLATE_HEADERS] as string[];

/** Minimal valid PNG buffer (magic + padding so length >= 12). */
export function pngBytes(size = 16): Buffer {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  return b;
}

/** Minimal valid JPEG buffer. */
export function jpegBytes(size = 16): Buffer {
  const b = Buffer.alloc(size);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).copy(b, 0);
  return b;
}

/** Minimal valid WebP buffer. */
export function webpBytes(size = 16): Buffer {
  const b = Buffer.alloc(size, 0);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBP', 8, 'latin1');
  return b;
}

/** Garbage buffer (invalid magic). */
export function junkBytes(size = 16): Buffer {
  return Buffer.alloc(size, 0x41);
}

/** Build an .xlsx buffer from an array of row objects keyed by Spanish headers. */
export async function buildGiftWorkbook(
  rows: Array<Record<string, unknown>>,
  headers: string[] = GIFT_HEADERS,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Regalos');
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow(headers.map((h) => (r[h] === undefined ? '' : r[h])));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as ArrayBuffer);
}

/** Build a ZIP buffer from an entries map. Directory entries auto-created. */
export async function buildZip(
  entries: Record<string, Buffer>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(buf as unknown as ArrayBuffer);
}

/** Build an .xlsx buffer with a custom (possibly wrong) header row. */
export async function buildGiftWorkbookWithHeaders(
  headers: string[],
  rows: Array<Array<unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Regalos');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as ArrayBuffer);
}

export function mockMulterFile(
  buffer: Buffer,
  originalname: string,
  fieldname: string,
): Express.Multer.File {
  return {
    buffer,
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    fieldname,
    size: buffer.length,
  } as unknown as Express.Multer.File;
}

/** A valid gift row (Spanish keys), with sensible defaults. */
export function validGiftRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    CarpetaImagenes: 'GFT-001',
    Campaña: 'tigo-2026',
    Nombre: 'Regalo Uno',
    Referencia: 'GFT-001',
    DescripciónCorta: '',
    DescripciónTécnica: '',
    Medidas: '',
    Cantidad: 10,
    EdadMinima: 0,
    EdadMaxima: 13,
    Género: 'todos',
    Estado: 'Activo',
    ...overrides,
  };
}

/** Cartridge for the shared service under test. */
export function createTestContext() {
  const tx = {
    gift: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 101, campaignId: 1, reference: 'GFT-001' },
      ]),
    },
  };
  const prisma = {
    campaign: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 1, slug: 'tigo-2026', status: 'DRAFT' }]),
    },
    gift: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    giftImage: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const storage = {
    buildStoragePath: jest.fn(
      (cid: number, gid: number, ext: string) =>
        `campaign-${cid}/gift-${gid}/img${ext}`,
    ),
    uploadFile: jest.fn().mockResolvedValue('https://cdn.example.com/img.png'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  return { tx, prisma, storage };
}
