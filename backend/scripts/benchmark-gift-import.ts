/**
 * Manual benchmark for the bulk gift import (first-version conservative limits).
 *
 * Usage (backend dir, requires DATABASE_URL + Supabase credentials in .env):
 *   npx ts-node scripts/benchmark-gift-import.ts                # runs 10/25/50
 *   npx ts-node scripts/benchmark-gift-import.ts 25             # single size
 *
 * It builds a synthetic Excel (N rows) + ZIP (N folders x 3 PNGs) in memory and
 * times `validatePackage` and `commitImport` against the REAL database and REAL
 * Supabase Storage. It creates a temporary campaign and cleans up every gift
 * and image it creates afterwards.
 *
 * This script is NOT part of the automated test suite and must never be run in
 * CI: it performs real writes to the configured (non-test) database/storage.
 */

import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseStorageService } from '../src/common/services/supabase-storage.service';
import { GiftImportService } from '../src/gift-imports/gift-import.service';

const SIZES: Record<number, number> = { 10: 30, 25: 75, 50: 150 };

function pngBytes(size = 2048): Buffer {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  return b;
}

async function buildExcel(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Regalos');
  ws.addRow([
    'CarpetaImagenes',
    'Campaña',
    'Nombre',
    'Referencia',
    'DescripciónCorta',
    'DescripciónTécnica',
    'Medidas',
    'Cantidad',
    'EdadMinima',
    'EdadMaxima',
    'Género',
    'Estado',
  ]);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as ArrayBuffer);
}

async function buildZip(entries: Record<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(buf as unknown as ArrayBuffer);
}

function mockFile(buffer: Buffer, originalname: string): Express.Multer.File {
  return {
    buffer,
    originalname,
    size: buffer.length,
    fieldname: 'file',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
  } as unknown as Express.Multer.File;
}

async function main(): Promise<void> {
  const countArg = Number(process.argv[2]);
  const targets = Array.isArray(countArg) && countArg === 0 ? [10, 25, 50] : [
    SIZES[countArg] !== undefined ? countArg : 10,
  ];
  const giftCount = targets[0];

  const prisma = new PrismaService();
  const storage = new SupabaseStorageService();
  const service = new GiftImportService(prisma, storage);

  const slug = `bench-gift-${Date.now()}`;
  const campaign = await prisma.campaign.create({
    data: {
      name: `Benchmark import ${giftCount}`,
      slug,
      status: 'DRAFT',
    },
  });

  const rows: Array<Record<string, unknown>> = [];
  const entries: Record<string, Buffer> = {};
  for (let i = 1; i <= giftCount; i++) {
    const ref = `BNCH-${String(i).padStart(4, '0')}`;
    rows.push({
      CarpetaImagenes: ref,
      Campaña: slug,
      Nombre: `Regalo benchmark ${i}`,
      Referencia: ref,
      DescripciónCorta: 'Regalo sintético de benchmark',
      DescripciónTécnica: 'Sin contenido real',
      Medidas: '10x10x10',
      Cantidad: 50,
      EdadMinima: 0,
      EdadMaxima: 13,
      Género: 'todos',
      Estado: 'Activo',
    });
    entries[`${ref}/1.png`] = pngBytes();
    entries[`${ref}/2.png`] = pngBytes();
    entries[`${ref}/3.png`] = pngBytes();
  }

  const excelBuf = await buildExcel(rows);
  const zipBuf = await buildZip(entries);
  const excel = mockFile(excelBuf, 'bench.xlsx');
  const zip = mockFile(zipBuf, 'bench.zip');

  let createdGiftIds: number[] = [];
  let uploadedPaths: string[] = [];

  try {
    const t0 = performance.now();
    const report = await service.validatePackage(excel, zip, 0);
    const tValidate = performance.now() - t0;
    console.log(
      `validate [${giftCount} gifts / ${giftCount * 3} images]: ${tValidate.toFixed(0)} ms ` +
        `canImport=${report.canImport} errors=${report.errorCount}`,
    );

    const t1 = performance.now();
    const result = (await service.commitImport(excel, zip, 0)) as any;
    const tCommit = performance.now() - t1;
    const committed = result.canImport === true;
    console.log(
      `commit   [${giftCount} gifts / ${giftCount * 3} images]: ${tCommit.toFixed(0)} ms ` +
        `giftsCreated=${committed ? result.giftsCreated : 0} ` +
        `imagesUploaded=${committed ? result.imagesUploaded : 0}`,
    );

    if (result.canImport === true) {
      const found = await prisma.gift.findMany({
        where: { campaignId: campaign.id },
        select: { id: true },
      });
      createdGiftIds = found.map((g) => g.id);
      const images = await prisma.giftImage.findMany({
        where: { giftId: { in: createdGiftIds } },
        select: { id: true, imageUrl: true },
      });
      uploadedPaths = images.map((im) => {
        try {
          const u = new URL(im.imageUrl);
          const parts = u.pathname.split('/');
          const idx = parts.indexOf('public');
          return idx === -1 ? null : parts.slice(idx + 2).join('/');
        } catch {
          return null;
        }
      }).filter((p): p is string => p !== null);
    }
  } finally {
    // Cleanup: remove uploaded objects, gift images, gifts and the temp campaign.
    await Promise.allSettled(
      uploadedPaths.map((p) => storage.deleteFile(p)),
    );
    if (createdGiftIds.length > 0) {
      await prisma.giftImage.deleteMany({
        where: { giftId: { in: createdGiftIds } },
      });
      await prisma.gift.deleteMany({ where: { id: { in: createdGiftIds } } });
    }
    await prisma.campaign.deleteMany({ where: { id: campaign.id } });
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('benchmark failed:', err);
    process.exit(1);
  });
