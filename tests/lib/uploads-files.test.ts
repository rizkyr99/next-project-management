import { describe, expect, it } from 'vitest';
import { cleanFileName, fileExtension, fileProblem, isAllowedFileName, MAX_FILE_BYTES } from '@/lib/uploads';
import { formatBytes, PLAN_DETAILS, storageLimitLabel } from '@/lib/plans';

describe('file rules (B3)', () => {
  it('reads extensions, any case, ignoring dotfiles', () => {
    expect(fileExtension('Brand Guide.PDF')).toBe('pdf');
    expect(fileExtension('archive.tar.zip')).toBe('zip');
    expect(fileExtension('.env')).toBe('');
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });

  it('allows studio files and refuses programs and web pages', () => {
    for (const ok of ['a.pdf', 'b.docx', 'c.fig', 'd.psd', 'e.mp4', 'f.zip', 'g.woff2', 'h.svg']) {
      expect(isAllowedFileName(ok)).toBe(true);
    }
    for (const bad of ['a.exe', 'b.sh', 'c.html', 'd.js', 'e.dmg', 'f.app', 'g', 'h.pdf.exe']) {
      expect(isAllowedFileName(bad)).toBe(false);
    }
  });

  it('cleans names: no paths or control characters, 255 characters with the extension kept', () => {
    expect(cleanFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(cleanFileName('C:\\Users\\me\\brief.pdf')).toBe('brief.pdf');
    expect(cleanFileName('bad\r\nname\u0000.pdf')).toBe('badname.pdf');
    const long = cleanFileName(`${'a'.repeat(400)}.pdf`);
    expect(long).toHaveLength(255);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('explains why a file cannot be attached', () => {
    expect(fileProblem('a.pdf', 10)).toBeNull();
    expect(fileProblem('a.exe', 10)).toMatch(/can’t be attached/);
    expect(fileProblem('a.pdf', 0)).toMatch(/empty/);
    expect(fileProblem('a.pdf', MAX_FILE_BYTES + 1)).toMatch(/100 MB/);
  });
});

describe('formatBytes', () => {
  it('uses binary units, rounding sensibly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(4.25 * 1024 * 1024)).toBe('4.3 MB');
    expect(formatBytes(20 * 1024 ** 3)).toBe('20 GB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
  });

  it('labels each plan’s storage', () => {
    expect(storageLimitLabel(PLAN_DETAILS.free.storageBytes)).toBe('1 GB of files per workspace');
    expect(PLAN_DETAILS.pro.storageBytes).toBeGreaterThan(PLAN_DETAILS.free.storageBytes);
    expect(PLAN_DETAILS.business.storageBytes).toBeGreaterThan(PLAN_DETAILS.pro.storageBytes);
  });
});
