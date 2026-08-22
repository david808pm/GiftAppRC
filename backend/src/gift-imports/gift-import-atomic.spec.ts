import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GiftImportService } from './gift-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';
import {
  buildGiftWorkbook,
  buildZip,
  mockMulterFile,
  validGiftRow,
  createTestContext,
  pngBytes,
} from './test-utils';

function makeService(ctx: ReturnType<typeof createTestContext>) {
  return new GiftImportService(
    ctx.prisma as unknown as PrismaService,
    ctx.storage as unknown as SupabaseStorageService,
  );
}

async function validPackage(
  rows: Array<Record<string, unknown>>,
  zipEntries: Record<string, Buffer>,
): Promise<{ excel: Express.Multer.File; zip: Express.Multer.File }> {
  const excelBuf = await buildGiftWorkbook(rows);
  const zipBuf = await buildZip(zipEntries);
  return {
    excel: mockMulterFile(excelBuf, 'regalos.xlsx', 'excel'),
    zip: mockMulterFile(zipBuf, 'imagenes.zip', 'zip'),
  };
}

describe('GiftImportService — atomic rule + compensated all-or-nothing', () => {
  it('a single blocking error → zero writes and zero uploads', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);

    // Empty stock is a blocking error (never silently defaulted).
    const { excel, zip } = await validPackage(
      [validGiftRow({ Cantidad: '' })],
      { 'GFT-001/img.png': pngBytes() },
    );
    const result = await service.validatePackage(excel, zip, 1);

    expect(result.canImport).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    expect(ctx.tx.gift.createMany).not.toHaveBeenCalled();
    expect(ctx.prisma.giftImage.createMany).not.toHaveBeenCalled();
    expect(ctx.storage.uploadFile).not.toHaveBeenCalled();
    expect(ctx.storage.deleteFile).not.toHaveBeenCalled();
  });

  it('invalid gender (blocking) → zero writes', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow({ Género: 'robot' })],
      { 'GFT-001/img.png': pngBytes() },
    );
    const result = await service.validatePackage(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVALID_ALLOWED_GENDER')).toBe(true);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('happy path creates the gift + images and returns only counts', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow()],
      { 'GFT-001/img1.png': pngBytes(64) },
    );

    const result = (await service.commitImport(excel, zip, 7)) as any;

    expect(result.canImport).toBe(true);
    expect(result.giftsCreated).toBe(1);
    expect(result.imagesUploaded).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(ctx.prisma.$transaction).toHaveBeenCalled();
    expect(ctx.tx.gift.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          campaignId: 1,
          reference: 'GFT-001',
          name: 'Regalo Uno',
          stock: 10,
          minAge: 0,
          maxAge: 13,
          allowedGender: 'all',
          status: 'ACTIVE',
          createdById: 7,
        }),
      ]),
    });
    expect(ctx.storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.giftImage.createMany).toHaveBeenCalledTimes(1);
    const imageData = (ctx.prisma.giftImage.createMany as jest.Mock).mock.calls[0][0]
      .data;
    expect(imageData).toHaveLength(1);
    expect(imageData[0]).toMatchObject({ giftId: 101, sortOrder: 0, isPrimary: true });
  });

  it('one upload failure cleans ALL earlier uploaded objects and created gifts', async () => {
    const ctx = createTestContext();
    // Two gifts in one batch.
    (ctx.tx.gift.findMany as jest.Mock).mockResolvedValue([
      { id: 101, campaignId: 1, reference: 'GFT-001' },
      { id: 102, campaignId: 1, reference: 'GFT-002' },
    ]);
    ctx.storage.uploadFile
      .mockResolvedValueOnce('https://cdn.example.com/g1.png')
      .mockRejectedValueOnce(new Error('boom upload'));

    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow(), validGiftRow({ Referencia: 'GFT-002', CarpetaImagenes: 'GFT-002', Nombre: 'Regalo Dos' })],
      { 'GFT-001/a.png': pngBytes(), 'GFT-002/b.png': pngBytes() },
    );

    await expect(service.commitImport(excel, zip, 1)).rejects.toThrow('boom upload');

    // The first (successful) upload's storage object is removed.
    expect(ctx.storage.deleteFile).toHaveBeenCalledWith(
      'campaign-1/gift-101/img.png',
    );
    // All gifts created by this attempt (both batches here) are removed.
    expect(ctx.prisma.gift.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [101, 102] } },
    });
    expect(ctx.prisma.giftImage.deleteMany).toHaveBeenCalledWith({
      where: { giftId: { in: [101, 102] } },
    });
    // Only the gift created by this attempt is deleted — pre-existing ids untouched.
    const whereArg = (ctx.prisma.gift.deleteMany as jest.Mock).mock.calls[0][0]
      .where.id.in;
    expect(whereArg).not.toContain(999);
  });

  it('cleanup continues even when one storage deletion fails', async () => {
    const ctx = createTestContext();
    (ctx.tx.gift.findMany as jest.Mock).mockResolvedValue([
      { id: 101, campaignId: 1, reference: 'GFT-001' },
      { id: 102, campaignId: 1, reference: 'GFT-002' },
    ]);
    ctx.storage.uploadFile
      .mockResolvedValueOnce('https://cdn.example.com/g1.png')
      .mockRejectedValueOnce(new Error('boom upload'));

    // First storage delete fails, second would succeed — cleanup must continue.
    ctx.storage.deleteFile
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce(undefined);

    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow(), validGiftRow({ Referencia: 'GFT-002', CarpetaImagenes: 'GFT-002', Nombre: 'Regalo Dos' })],
      { 'GFT-001/a.png': pngBytes(), 'GFT-002/b.png': pngBytes() },
    );

    // Original import error is preserved even though cleanup partially failed.
    await expect(service.commitImport(excel, zip, 1)).rejects.toThrow('boom upload');

    // Every uploaded object was still attempted.
    expect(ctx.storage.deleteFile).toHaveBeenCalledTimes(1);
    // Gift cleanup still ran despite the storage delete failure.
    expect(ctx.prisma.giftImage.deleteMany).toHaveBeenCalled();
    expect(ctx.prisma.gift.deleteMany).toHaveBeenCalled();
  });

  it('earlier successful batches are removed after a later batch failure', async () => {
    const ctx = createTestContext();
    // 11 gifts => 2 batches (batch size 10). Batch 1 (10 gifts) commits and
    // uploads; batch 2 (gift 11) fails its upload => ALL 11 must be removed.
    let nextId = 100;
    (ctx.tx.gift.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where: { reference: { in: string[] } } }) =>
        where.reference.in.map((ref) => ({
          id: ++nextId,
          campaignId: 1,
          reference: ref,
        })),
    );
    // Fail on the 11th upload (the only gift in batch 2).
    ctx.storage.uploadFile
      .mockResolvedValueOnce('https://cdn.example.com/imgs/1.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/2.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/3.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/4.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/5.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/6.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/7.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/8.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/9.png')
      .mockResolvedValueOnce('https://cdn.example.com/imgs/10.png')
      .mockRejectedValueOnce(new Error('second batch boom'));

    const rows: Array<Record<string, unknown>> = [];
    const zipEntries: Record<string, Buffer> = {};
    for (let i = 1; i <= 11; i++) {
      const ref = `GFT-${String(i).padStart(3, '0')}`;
      rows.push(
        validGiftRow({
          CarpetaImagenes: ref,
          Referencia: ref,
          Nombre: `Regalo ${i}`,
        }),
      );
      zipEntries[`${ref}/img.png`] = pngBytes();
    }
    const excelBuf = await buildGiftWorkbook(rows);
    const zipBuf = await buildZip(zipEntries);

    const service = makeService(ctx);
    await expect(
      service.commitImport(
        mockMulterFile(excelBuf, 'regalos.xlsx', 'excel'),
        mockMulterFile(zipBuf, 'imagenes.zip', 'zip'),
        1,
      ),
    ).rejects.toThrow('second batch boom');

    // Both batches' gifts (101..111) compensated.
    expect(ctx.prisma.gift.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111] } },
    });
    // All 10 successfully uploaded storage objects removed.
    expect(ctx.storage.deleteFile).toHaveBeenCalledTimes(10);
  });

  it('case-insensitive folder ambiguity blocks the import with zero writes', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow({ CarpetaImagenes: 'ABC' })],
      { 'ABC/a.png': pngBytes(), 'abc/b.png': pngBytes() },
    );
    const result = await service.validatePackage(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(
      result.issues.some((i) => i.code === 'DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE'),
    ).toBe(true);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unsupported file inside a referenced folder blocks the import', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow()],
      { 'GFT-001/img.png': pngBytes(), 'GFT-001/notas.txt': Buffer.from('x') },
    );
    const result = await service.validatePackage(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(
      result.issues.some((i) => i.code === 'UNSUPPORTED_FILE_IN_IMAGE_FOLDER'),
    ).toBe(true);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nested folder inside a referenced folder blocks the import', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow()],
      { 'GFT-001/sub/x.png': pngBytes() },
    );
    const result = await service.validatePackage(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(
      result.issues.some((i) => i.code === 'NESTED_FOLDER_IN_IMAGE_FOLDER'),
    ).toBe(true);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('folder not found in the ZIP is a blocking error', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow({ CarpetaImagenes: 'NO-EXISTE' })],
      { 'GFT-001/img.png': pngBytes() },
    );
    const result = await service.validatePackage(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(result.issues.some((i) => i.code === 'IMAGE_FOLDER_NOT_FOUND')).toBe(true);
  });

  it('validation response contains no image buffers or base64 content', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow()],
      { 'GFT-001/img.png': pngBytes(128) },
    );
    const result = await service.validatePackage(excel, zip, 1);

    const serialized = JSON.stringify(result);
    expect(serialized.includes('iVBOR')).toBe(false); // base64 PNG prefix
    expect(serialized.includes('base64')).toBe(false);
    expect(serialized.includes('buffer')).toBe(false);

    const preview = result.folderPreviews[0];
    expect(preview).toMatchObject({
      row: 2,
      campaignSlug: 'tigo-2026',
      name: 'Regalo Uno',
      reference: 'GFT-001',
      imageFolder: 'GFT-001',
      matched: true,
    });
    expect(Object.keys(preview.files[0]).sort()).toEqual(['mime', 'name', 'size']);
  });

  it('swapped files (excel field contains a zip) are rejected', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow()],
      { 'GFT-001/img.png': pngBytes() },
    );
    // Swap: excel field carries the zip file.
    await expect(
      service.validatePackage(
        mockMulterFile(zip.buffer, 'imagenes.zip', 'excel'),
        mockMulterFile(excel.buffer, 'regalos.xlsx', 'zip'),
        1,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('missing folder declared in a row → blocking, zero writes', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    const { excel, zip } = await validPackage(
      [validGiftRow({ CarpetaImagenes: 'MISSING' })],
      { 'GFT-001/img.png': pngBytes() },
    );
    const result = await service.commitImport(excel, zip, 1);
    expect(result.canImport).toBe(false);
    expect(ctx.prisma.gift.deleteMany).not.toHaveBeenCalled();
  });

  it('parallel uploads are awaited and every successful one is cleaned on failure', async () => {
    const ctx = createTestContext();
    let counter = 0;
    (ctx.storage.buildStoragePath as jest.Mock).mockImplementation(
      (cid: number, gid: number) => {
        counter += 1;
        return `campaign-${cid}/gift-${gid}/img${counter}.png`;
      },
    );
    // Three images in the same folder (pool size 3). Middle one fails; the
    // other two succeed and must STILL be tracked and removed.
    ctx.storage.uploadFile
      .mockResolvedValueOnce('https://cdn.example.com/a.png')
      .mockRejectedValueOnce(new Error('parallel boom'))
      .mockResolvedValueOnce('https://cdn.example.com/c.png');

    const service = makeService(ctx);
    const excelBuf = await buildGiftWorkbook([validGiftRow()]);
    const zipBuf = await buildZip({
      'GFT-001/a.png': pngBytes(),
      'GFT-001/b.png': pngBytes(),
      'GFT-001/c.png': pngBytes(),
    });

    await expect(
      service.commitImport(
        mockMulterFile(excelBuf, 'regalos.xlsx', 'excel'),
        mockMulterFile(zipBuf, 'imagenes.zip', 'zip'),
        1,
      ),
    ).rejects.toThrow('parallel boom');

    // Both successful uploads were awaited and tracked; both get cleaned.
    expect(ctx.storage.deleteFile).toHaveBeenCalledTimes(2);
    const deleted = (ctx.storage.deleteFile as jest.Mock).mock.calls.map(
      (c: any) => c[0],
    );
    expect(deleted).toContain('campaign-1/gift-101/img1.png');
    expect(deleted).toContain('campaign-1/gift-101/img3.png');
    // The failed upload never produced a storage object to delete.
    expect(deleted).not.toContain('campaign-1/gift-101/img2.png');
    // The gift itself is still removed.
    expect(ctx.prisma.gift.deleteMany).toHaveBeenCalled();
  });

  it('a folder containing only OS metadata is ignored with a warning and the gift imports without images', async () => {
    const ctx = createTestContext();
    const service = makeService(ctx);
    // Two rows: GFT-001 has only .DS_Store (ignored); GFT-002 has a real image.
    const excelBuf = await buildGiftWorkbook([
      validGiftRow(),
      validGiftRow({
        CarpetaImagenes: 'GFT-002',
        Referencia: 'GFT-002',
        Nombre: 'Regalo Dos',
      }),
    ]);
    const zipBuf = await buildZip({
      'GFT-001/.DS_Store': Buffer.from('x'),
      'GFT-002/img.png': pngBytes(),
    });
    const result = await service.validatePackage(
      mockMulterFile(excelBuf, 'regalos.xlsx', 'excel'),
      mockMulterFile(zipBuf, 'imagenes.zip', 'zip'),
      1,
    );
    expect(result.canImport).toBe(true);
    expect(
      result.issues.some((i) => i.code === 'OS_METADATA_IGNORED'),
    ).toBe(true);
    expect(result.summary.totalImages).toBe(1); // only GFT-002's image counts
  });
});
