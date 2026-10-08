import { describe, it, expect } from 'vitest';
import { buildCertificateDoc, previewSnapshot } from '../src/data/certificatePdf.js';

const snap = {
  headerLines: ['צברי נורית וגבריאל', "משק מס' 10", 'מושב חצבה', 'נייד: 052', 'עוסק מורשה 054897764'],
  driverName: 'אדם', number: 51219, shipmentDate: '2025-07-09', destination: 'שיווק האיחוד- פתח תקווה',
  rows: [{ recordId: 'a', palletNumber: 421, kind: 'שלי', size: '15', boxes: 120, weight: 753, firstOfPallet: true },
         { recordId: 'b', palletNumber: 421, kind: 'שלי', size: '16', boxes: 10, weight: 60, firstOfPallet: false }],
  palletCount: 1, totalBoxes: 130, totalWeight: 813,
};

describe('buildCertificateDoc', () => {
  it('renders one page per snapshot', () => {
    const doc = buildCertificateDoc([snap, { ...snap, number: 51220 }]);
    expect(doc.content.filter(n => n.pageBreak === 'before')).toHaveLength(1);
  });
  it('has the 9 columns right-to-left and exactly 13 body rows', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const header = table.table.body[0].map(c => c.text);
    expect(header).toEqual(['מחיר', 'כמות משטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"]);
    expect(table.table.body).toHaveLength(1 + 13);
  });
  it('fills rows with pallet count 1 only on the first row of a pallet', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const [r1, r2] = table.table.body.slice(1, 3).map(r => r.map(c => c.text));
    expect(r1).toEqual(['', '1', '753', '120', '', '', '15', 'שלי', '421']);
    expect(r2[1]).toBe('');
  });
  it('shows the number in red, the header lines, the destination and totals', () => {
    const json = JSON.stringify(buildCertificateDoc([snap]));
    expect(json).toContain('"text":"51219"');
    expect(json).toMatch(/"51219","bold":true,"color":"#dc2626"|"color":"#dc2626"[^}]*"51219"/);
    snap.headerLines.forEach(l => expect(json).toContain(l));
    expect(json).toContain('שיווק האיחוד- פתח תקווה');
    expect(json).toContain('2025-07-09');
    expect(json).toContain('"text":"אדם"');
  });
  it('previewSnapshot builds a printable sample from a profile', () => {
    const s = previewSnapshot({ headerLines: ['a', 'b', 'c', 'd', 'e'], driverName: '', nextNumber: 7 });
    expect(s.number).toBe(7);
    expect(() => buildCertificateDoc([s])).not.toThrow();
  });
});
