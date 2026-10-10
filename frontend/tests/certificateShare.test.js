import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('pdfmake/build/pdfmake', () => ({
  default: { createPdf: () => ({ getBlob: (cb) => cb(new Blob(['%PDF'], { type: 'application/pdf' })) }) },
}));
vi.mock('../fonts/vfs_fonts.js', () => ({ default: {} }));

const { printCertificates, printWithRetap, ShareNeedsTapError, preloadPdf } = await import('../src/data/certificatePdf.js');

const snap = {
  headerLines: ['כותרת', 'a', 'b', 'c', 'd'], driverName: '', number: 1, shipmentDate: '2026-12-01', destination: 'יעד',
  rows: [{ recordId: 'r', palletNumber: 1, kind: 'זן', size: '12', boxes: 10, weight: 100, firstOfPallet: true }],
  palletCount: 1, totalBoxes: 10, totalWeight: 100,
};

const domError = (name) => Object.assign(new Error(name), { name });

describe('printCertificates share handling', () => {
  let share;
  beforeEach(() => {
    share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: () => true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares the PDF file', async () => {
    share.mockResolvedValue();
    expect(await printCertificates([snap], 'c.pdf')).toBe('shared');
    expect(share.mock.calls[0][0].files[0].name).toBe('c.pdf');
  });

  it('maps NotAllowedError to ShareNeedsTapError carrying the built file', async () => {
    share.mockRejectedValue(domError('NotAllowedError'));
    const err = await printCertificates([snap], 'c.pdf').catch(e => e);
    expect(err).toBeInstanceOf(ShareNeedsTapError);
    expect(err.file.name).toBe('c.pdf');
  });

  it('treats AbortError (user cancelled) as a non-failure', async () => {
    share.mockRejectedValue(domError('AbortError'));
    expect(await printCertificates([snap], 'c.pdf')).toBe('cancelled');
  });

  it('lets other share failures propagate', async () => {
    share.mockRejectedValue(new Error('boom'));
    await expect(printCertificates([snap], 'c.pdf')).rejects.toThrow('boom');
  });

  it('printWithRetap re-shares the same file after a fresh tap, and does nothing if declined', async () => {
    share.mockRejectedValueOnce(domError('NotAllowedError')).mockResolvedValueOnce();
    const confirm = vi.fn().mockResolvedValue(true);
    expect(await printWithRetap([snap], 'c.pdf', confirm)).toBe('shared');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'התעודה מוכנה להדפסה', confirmText: 'הדפס' }));
    expect(share).toHaveBeenCalledTimes(2);
    expect(share.mock.calls[1][0].files[0]).toBe(share.mock.calls[0][0].files[0]);

    share.mockReset();
    share.mockRejectedValueOnce(domError('NotAllowedError'));
    expect(await printWithRetap([snap], 'c.pdf', vi.fn().mockResolvedValue(false))).toBe('cancelled');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('a cancelled retry is silent', async () => {
    share.mockRejectedValueOnce(domError('NotAllowedError')).mockRejectedValueOnce(domError('AbortError'));
    expect(await printWithRetap([snap], 'c.pdf', vi.fn().mockResolvedValue(true))).toBe('cancelled');
  });
});

describe('preloadPdf', () => {
  it('is idempotent and never throws', () => {
    expect(() => { preloadPdf(); preloadPdf(); }).not.toThrow();
  });
});
