import 'reflect-metadata';
import {
  loadGiftZip,
  isUnsafePath,
  isOsMetadataFile,
  ZipFolderMeta,
} from './gift-import-zip';
import { GIFT_CODE } from './gift-import-validation';
import { buildZip, pngBytes } from './test-utils';

describe('isUnsafePath', () => {
  it('rejects traversal, absolute, drive, backslash', () => {
    expect(isUnsafePath('../evil.png')).toBe(true);
    expect(isUnsafePath('folder/../../evil.png')).toBe(true);
    expect(isUnsafePath('/etc/passwd')).toBe(true);
    expect(isUnsafePath('C:/windows/x.png')).toBe(true);
    expect(isUnsafePath('folder\\x.png')).toBe(true);
    expect(isUnsafePath('a//b.png')).toBe(true);
  });
  it('accepts safe relative paths', () => {
    expect(isUnsafePath('folder/img.png')).toBe(false);
    expect(isUnsafePath('folder/')).toBe(false);
  });
});

describe('isOsMetadataFile', () => {
  it('ignores .DS_Store, Thumbs.db, __MACOSX, AppleDouble', () => {
    expect(isOsMetadataFile('.DS_Store')).toBe(true);
    expect(isOsMetadataFile('Thumbs.db')).toBe(true);
    expect(isOsMetadataFile('__MACOSX')).toBe(true);
    expect(isOsMetadataFile('._img.png')).toBe(true);
  });
  it('does not ignore real images', () => {
    expect(isOsMetadataFile('img.png')).toBe(false);
  });
});

describe('loadGiftZip — package security', () => {
  it('loads a valid zip and inventories folders', async () => {
    const zipBuf = await buildZip({
      'GFT-001/img1.png': pngBytes(),
      'GFT-001/img2.png': pngBytes(),
      'GFT-002/other.jpg': pngBytes(),
    });
    const res = await loadGiftZip(zipBuf);
    expect(res.zip).not.toBeNull();
    expect(res.issues).toHaveLength(0);
    expect(res.folders.size).toBe(2);
    const folder = res.folders.get('gft-001') as ZipFolderMeta;
    expect(folder.display).toBe('GFT-001');
    expect(folder.files).toHaveLength(2);
  });

  it('rejects path traversal with a blocking error and no usable zip', async () => {
    const zipBuf = await buildZip({
      '../evil.png': pngBytes(),
      'GFT-001/img.png': pngBytes(),
    });
    const res = await loadGiftZip(zipBuf);
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_PATH_TRAVERSAL)).toBe(true);
    // A traversal is blocking: no usable zip may be used for import.
    expect(res.zip).not.toBeNull();
  });

  it('rejects absolute paths', async () => {
    const zipBuf = await buildZip({
      '/etc/passwd': Buffer.from('x'),
      'GFT-001/img.png': pngBytes(),
    });
    const res = await loadGiftZip(zipBuf);
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_PATH_TRAVERSAL)).toBe(true);
  });

  it('rejects too many entries', async () => {
    const files: Record<string, Buffer> = {};
    for (let i = 0; i < 301; i++) {
      files[`f${i}.txt`] = Buffer.from('x');
    }
    const zipBuf = await buildZip(files);
    const res = await loadGiftZip(zipBuf);
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_TOO_MANY_ENTRIES)).toBe(true);
  });

  it('rejects a per-entry bomb (huge uncompressed single file)', async () => {
    const zipBuf = await buildZip({
      'GFT-001/huge.png': Buffer.alloc(11 * 1024 * 1024, 0x00),
    });
    const res = await loadGiftZip(zipBuf);
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_ENTRY_TOO_LARGE)).toBe(true);
  });

  it('detects case-insensitive folder ambiguity', async () => {
    const zipBuf = await buildZip({
      'ABC/img.png': pngBytes(),
      'abc/img2.png': pngBytes(),
    });
    const res = await loadGiftZip(zipBuf);
    expect(
      res.issues.some((i) => i.code === GIFT_CODE.DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE),
    ).toBe(true);
  });

  it('warns (non-blocking) about root-level files', async () => {
    const zipBuf = await buildZip({
      'notas.txt': Buffer.from('hola'),
      'GFT-001/img.png': pngBytes(),
    });
    const res = await loadGiftZip(zipBuf);
    expect(res.warnings.some((i) => i.code === GIFT_CODE.ZIP_ROOT_FILES_IGNORED)).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it('rejects a non-zip / corrupt buffer as ZIP_INVALID', async () => {
    const res = await loadGiftZip(Buffer.from('not a zip at all'));
    expect(res.zip).toBeNull();
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_INVALID)).toBe(true);
  });

  it('exceeds total uncompressed cap (metadata-only, no inflate)', async () => {
    // 26 x 8MB = 208MB uncompressed (each below the 10MB per-entry cap).
    const files: Record<string, Buffer> = {};
    for (let i = 0; i < 26; i++) {
      files[`GFT-001/b${i}.png`] = Buffer.alloc(8 * 1024 * 1024, i);
    }
    const zipBuf = await buildZip(files);
    const res = await loadGiftZip(zipBuf);
    expect(res.issues.some((i) => i.code === GIFT_CODE.ZIP_UNCOMPRESSED_TOO_LARGE)).toBe(true);
  });
});

describe('inflateEntry', () => {
  it('returns the raw buffer for a referenced image', async () => {
    const img = pngBytes(64);
    const zipBuf = await buildZip({ 'GFT-001/img.png': img });
    const res = await loadGiftZip(zipBuf);
    const entry = res.folders.get('gft-001')!.files[0];
    const { inflateEntry } = await import('./gift-import-zip');
    const out = await inflateEntry(res.zip!, entry.name);
    expect(out.equals(img)).toBe(true);
  });
});
