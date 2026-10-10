import { describe, it, expect } from 'vitest';
import { buildCertificateDoc, previewSnapshot, toVisual, toPdfText, pdfTextToString } from '../src/data/certificatePdf.js';

const snap = {
  headerLines: ['צברי נורית וגבריאל', "משק מס' 10", 'מושב חצבה', 'נייד: 052', 'עוסק מורשה 054897764'],
  driverName: 'אדם', number: 51219, shipmentDate: '2025-07-09', destination: 'שיווק האיחוד- פתח תקווה',
  rows: [{ recordId: 'a', palletNumber: 421, kind: 'שלי', size: '15', boxes: 120, weight: 753, firstOfPallet: true },
         { recordId: 'b', palletNumber: 421, kind: 'שלי', size: '16', boxes: 10, weight: 60, firstOfPallet: false }],
  palletCount: 1, totalBoxes: 130, totalWeight: 813,
};

describe('toVisual', () => {
  it('orders a pure Hebrew multi-word line right-to-left', () => {
    expect(toVisual('צברי נורית וגבריאל')).toBe('לאירבגו תירונ ירבצ');
  });
  it('keeps digit runs intact next to Hebrew', () => {
    expect(toVisual('נייד: 052-4260717')).toBe('052-4260717 :דיינ');
  });
  it('keeps a Latin email intact inside Hebrew', () => {
    expect(toVisual('אימייל tsuberi@arava.co.il נייד')).toBe('דיינ tsuberi@arava.co.il ליימיא');
  });
});

describe('buildCertificateDoc', () => {
  it('renders one page per snapshot', () => {
    const doc = buildCertificateDoc([snap, { ...snap, number: 51220 }]);
    expect(doc.content.filter(n => n.pageBreak === 'before')).toHaveLength(1);
  });
  it('has the 9 columns right-to-left and exactly 13 body rows', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const header = table.table.body[0].map(c => pdfTextToString(c.text));
    const logical = ['מחיר', 'כמות\nמשטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"];
    expect(header).toEqual(logical.map(h => pdfTextToString(toPdfText(h))));
    expect(table.table.body).toHaveLength(1 + 13);
  });
  it('fills rows with pallet count 1 only on the first row of a pallet', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const [r1, r2] = table.table.body.slice(1, 3).map(r => r.map(c => pdfTextToString(c.text)));
    expect(r1).toEqual(['', '1', '753', '120', '', '', '15', pdfTextToString(toPdfText('שלי')), '421']);
    expect(r2[1]).toBe('');
  });
  it('shows the number in red, the header lines, the destination and totals', () => {
    const json = JSON.stringify(buildCertificateDoc([snap]));
    expect(json).toContain('"text":"51219"');
    expect(json).toMatch(/"51219","bold":true,"color":"#dc2626"|"color":"#dc2626"[^}]*"51219"/);
    snap.headerLines.forEach(l => [].concat(toPdfText(l)).forEach(piece => expect(json).toContain(JSON.stringify(piece).slice(1, -1))));
    expect(json).toContain(JSON.stringify(toPdfText('שיווק')).slice(1, -1));
    expect(json).toContain('2025-07-09');
    expect(json).toContain(`"text":${JSON.stringify(toPdfText('אדם'))}`);
  });
  it('throws when a snapshot has more than 13 rows', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ ...snap.rows[0], recordId: `r${i}` }));
    expect(() => buildCertificateDoc([{ ...snap, rows }])).toThrow(/max 13/);
  });
  it('keeps the line order of an explicit two-line label', () => {
    const flat = pdfTextToString(toPdfText('סה"כ\nמשטחים', { bold: true }));
    expect(flat).toBe(`${pdfTextToString(toPdfText('סה"כ'))}\n${pdfTextToString(toPdfText('משטחים'))}`);
  });
  it('carries the style onto every piece and never auto-wraps single lines', () => {
    const pieces = toPdfText('תעודת משלוח', { bold: true, fontSize: 14 });
    expect(pieces.length).toBeGreaterThan(1);
    pieces.forEach(p => expect(p).toMatchObject({ bold: true, fontSize: 14 }));
    const doc = buildCertificateDoc([snap]);
    const dest = JSON.stringify(doc.content);
    expect(dest).toContain('"decoration":"underline"');
    expect(doc.content.find(n => n.table && n.table.widths?.length === 9).table.body[1].every(c => c.noWrap)).toBe(true);
  });
  it('keeps the 9-column table inside the A4 content width', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const total = table.table.widths.reduce((a, b) => a + b, 0) + 9 * 9; // + padding and border per column
    expect(total).toBeLessThanOrEqual(515);
  });
  it('previewSnapshot builds a printable sample from a profile', () => {
    const s = previewSnapshot({ headerLines: ['a', 'b', 'c', 'd', 'e'], driverName: '', nextNumber: 7 });
    expect(s.number).toBe(7);
    expect(() => buildCertificateDoc([s])).not.toThrow();
  });
});

describe('certificate layout (owner sample)', () => {
  const doc = buildCertificateDoc([snap]);
  const flat = (n) => pdfTextToString(n.text);
  const idxOfText = (str) => doc.content.findIndex(n => JSON.stringify(n).includes(JSON.stringify(toPdfText(str)).slice(1, -1)));
  it('puts the double rule after header line 4 and the small line 5 after the rule', () => {
    const rule = doc.content.findIndex(n => n.canvas && n.canvas.length === 2);
    expect(rule).toBeGreaterThan(0);
    expect(idxOfText('נייד')).toBeLessThan(rule);
    const vat = doc.content.findIndex(n => JSON.stringify(n).includes('054897764'));
    expect(vat).toBe(rule + 1);
    expect(JSON.stringify(doc.content[vat])).toContain('"fontSize":7');
  });
  it('skips empty header lines but still draws the rule once', () => {
    const d = buildCertificateDoc([{ ...snap, headerLines: ['כותרת', '', '', '', ''] }]);
    expect(d.content.filter(n => n.canvas).length).toBe(1);
    expect(d.content.some(n => JSON.stringify(n).includes('054897764'))).toBe(false);
  });
  it('has an empty bordered מגדל box and the date row', () => {
    const t = doc.content.find(n => n.table && n.table.widths?.length === 5);
    const cells = t.table.body[0];
    expect(cells[3]).toMatchObject({ text: '', border: [true, true, true, true] });
    expect(JSON.stringify(cells[4])).toContain(JSON.stringify(toPdfText("מגדל מס'")[0]).slice(1, -1));
    expect(flat(cells[0])).toBe('2025-07-09');
  });
  it('draws a thin page frame in the background', () => {
    expect(doc.background().canvas[0].type).toBe('rect');
  });
  it('has no grey fill on header cells and a thick outer table border', () => {
    const t = doc.content.find(n => n.table && n.table.widths?.length === 9 && n.table.headerRows === 1);
    t.table.body[0].forEach(c => expect(c.fillColor).toBeUndefined());
    const node = { table: { body: t.table.body, widths: t.table.widths } };
    expect(t.layout.hLineWidth(0, node)).toBeGreaterThan(t.layout.hLineWidth(1, node));
    expect(t.layout.vLineWidth(9, node)).toBeGreaterThan(t.layout.vLineWidth(4, node));
  });
  it('centers cell text vertically with a top margin', () => {
    const t = doc.content.find(n => n.table && n.table.widths?.length === 9 && n.table.headerRows === 1);
    expect(t.table.body[1][0].margin[1]).toBeGreaterThan(0);
    expect(t.table.body[1][0].alignment).toBe('center');
  });
  it('shows the pallet total in a thick-bordered box', () => {
    const t = doc.content.find(n => n.table && n.table.widths?.length === 9 && n.table.headerRows === undefined);
    const box = t.table.body[0][1];
    expect(flat(box.table.body[0][0])).toBe('1');
    expect(box.layout.hLineWidth()).toBeGreaterThanOrEqual(2);
  });
  it('has the fill-in labels, each with an underline cell, and the driver on the line', () => {
    const t = doc.content.find(n => n.table && n.table.widths?.length === 6);
    const json = JSON.stringify(t);
    ['כמות מעשר', 'שם המוביל', 'רכב מס', 'שעת יציאה', 'נפרק על-ידי', 'חתימה', 'שעה'].forEach(l => expect(json).toContain(JSON.stringify(toPdfText(l, { fontSize: 10, alignment: 'right' })[0].text).slice(1, -1)));
    expect(JSON.stringify(doc.content)).toContain(JSON.stringify(toPdfText('תוצרת')[0]).slice(1, -1));
    const underlined = t.table.body.flat().filter(c => JSON.stringify(c.border) === '[false,false,false,true]');
    expect(underlined.length).toBe(7); // כמות מעשר + 3 + 3
    expect(flat(t.table.body[1][4])).toBe(pdfTextToString(toPdfText('אדם')));
  });
});
