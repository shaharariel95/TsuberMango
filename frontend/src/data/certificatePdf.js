// Shipping certificate (תעודת משלוח) PDF. buildCertificateDoc is pure (unit-tested);
// printCertificates lazy-loads pdfmake + the Rubik font like the sticker printer does.
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
const RED = '#dc2626';
const CONTENT_W = 515; // A4 595 - 2*40 margins

// pdfmake 0.2 has no bidi: it lays glyphs out left-to-right in string order. So we run the
// Unicode Bidi Algorithm (RTL base) ourselves and hand pdfmake the already-visual string.
// One line only (no wrapping).
export function toVisual(text) {
  const str = text === undefined || text === null ? '' : String(text);
  if (!str) return '';
  const levels = bidi.getEmbeddingLevels(str, 'rtl');
  const order = bidi.getReorderedIndices(str, levels);
  const mirrored = bidi.getMirroredCharactersMap(str, levels);
  return order.map(i => (mirrored.has(i) ? mirrored.get(i) : str[i])).join('');
}

// pdfmake splits text into line-break segments (at spaces, hyphens, ...) and fontkit then reverses
// the glyph order of every segment that contains Hebrew. To stay in control we emit each Hebrew
// letter run, each non-Hebrew run and each space as its own piece, and pre-reverse only the Hebrew
// pieces so that fontkit's reversal restores them.
const PIECE = /[\u0590-\u05FF]+(?:["'\u05F3\u05F4][\u0590-\u05FF]+)*|[^\u0590-\u05FF ]+| /g;
const HEBREW = /[\u0590-\u05FF]/;
export function toPdfText(text, style = {}) {
  const str = text === undefined || text === null ? '' : String(text);
  const styled = Object.keys(style).length > 0;
  const wrap = (p) => (styled ? { text: p, ...style } : p);
  if (str.includes('\n')) {
    return str.split('\n').flatMap((l, i) => [...(i ? [wrap('\n')] : []), ...[].concat(toPdfText(l, style))]); // line order kept
  }
  const pieces = (toVisual(str).match(PIECE) || []).map(p => wrap(HEBREW.test(p) ? [...p].reverse().join('') : p));
  return pieces.length === 1 && !styled ? pieces[0] : pieces;
}
const STYLE_KEYS = ['bold', 'italics', 'fontSize', 'color', 'decoration'];
// A pdfmake text node for one printed line: every piece carries the style, and it never auto-wraps
// (the visual-order pieces would wrap in reverse). Use an explicit '\n' for intentional two-line labels.
const txt = (text, props = {}) => {
  const style = Object.fromEntries(Object.entries(props).filter(([k]) => STYLE_KEYS.includes(k)));
  return { text: toPdfText(text, style), noWrap: true, ...props };
};
// Flattens toPdfText output back to a plain string (for tests / debugging).
export const pdfTextToString = (t) => (Array.isArray(t) ? t.map(x => (typeof x === 'string' ? x : x.text)).join('') : (typeof t === 'object' && t ? t.text : t));
const BODY_ROWS = 13;
const COLUMNS = ['מחיר', 'כמות משטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"]; // left→right on paper = right-to-left reading
const WIDTH_WEIGHTS = [45, 50, 50, 45, 65, 55, 35, 70, 60];
const WIDTHS = WIDTH_WEIGHTS.map(w => w * (CONTENT_W - 9 * 9 - 2) / WIDTH_WEIGHTS.reduce((a, b) => a + b, 0)); // pdfmake adds 4+4pt padding and a 1pt border per column on top of the width

const cell = (text, extra = {}) => txt(text, { alignment: 'center', ...extra });

function rowCells(row) {
  if (!row) return COLUMNS.map(() => cell(''));
  return [cell(''), cell(row.firstOfPallet ? 1 : ''), cell(row.weight), cell(row.boxes), cell(''), cell(''),
    cell(row.size), cell(row.kind), cell(row.palletNumber)];
}

function certificatePage(s, index) {
  if (s.rows.length > BODY_ROWS) throw new Error(`certificate ${s.number} has ${s.rows.length} rows; max ${BODY_ROWS}`);
  const [title = '', ...lines] = s.headerLines || [];
  const body = [COLUMNS.map((h, i) => cell(i === 1 ? h.replace(' ', '\n') : h, { bold: true, fillColor: '#f1f5f9' }))];
  for (let i = 0; i < BODY_ROWS; i++) body.push(rowCells(s.rows[i]));
  return [
    { ...txt(title, { fontSize: 30, bold: true }), alignment: 'center', ...(index > 0 ? { pageBreak: 'before' } : {}) },
    ...lines.map((l, i) => ({ ...txt(l, { fontSize: i === 0 ? 11 : 9, bold: i === 0 }), alignment: 'center', margin: [0, 1, 0, 1] })),
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 1 }, { type: 'line', x1: 0, y1: 7, x2: 515, y2: 7, lineWidth: 1 }], margin: [0, 2, 0, 8] },
    { columns: [
      { text: [{ text: s.shipmentDate || '' }, { text: '   ' }, txt('תאריך:', { bold: true })], alignment: 'left' },
      txt("מגדל מס':", { bold: true, alignment: 'right' }),
    ], margin: [0, 0, 0, 6] },
    { text: [{ text: String(s.number), bold: true, color: RED, fontSize: 18 }, { text: '   ' }, txt("תעודת משלוח סמ'", { bold: true, fontSize: 14 })], alignment: 'center', margin: [0, 0, 0, 6] },
    { text: [txt(s.destination || '', { bold: true, fontSize: 15, decoration: 'underline' }), { text: ' ' }, txt('עבור:', { fontSize: 10 })], alignment: 'right', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: WIDTHS, heights: (i) => (i === 0 ? 28 : 22), body }, layout: { hLineWidth: () => 1, vLineWidth: () => 1 } },
    { table: { widths: [45, 50, 50, '*'], body: [[cell(''), cell(s.palletCount, { bold: true }), cell('סה"כ\nמשטחים', { fontSize: 9 }), cell('תוצרת מעושרת / נשלח מעשר', { alignment: 'right' })]] },
      layout: 'noBorders', margin: [0, 4, 0, 4] },
    { ...txt('כמות מעשר', { fontSize: 10 }), alignment: 'right', margin: [0, 2, 0, 6] },
    { columns: [
      txt('שעת יציאה', { fontSize: 10 }), txt('רכב מס', { fontSize: 10 }),
      txt(s.driverName, { alignment: 'center', fontSize: 11 }), txt('שם המוביל', { alignment: 'right', fontSize: 10 }),
    ], margin: [0, 6, 0, 6] },
    { columns: [
      txt('שעה', { fontSize: 10 }), txt('חתימה', { fontSize: 10 }), { text: '' }, txt('נפרק על-ידי', { alignment: 'right', fontSize: 10 }),
    ] },
  ];
}

export function buildCertificateDoc(snapshots) {
  return {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: 'Rubik', fontSize: 11, alignment: 'right' },
    content: snapshots.flatMap((s, i) => certificatePage(s, i)),
  };
}

export function previewSnapshot(profile) {
  return {
    headerLines: profile.headerLines, driverName: profile.driverName || '', number: profile.nextNumber,
    shipmentDate: new Date().toISOString().slice(0, 10), destination: 'יעד לדוגמה',
    rows: [{ recordId: 'p1', palletNumber: 1, kind: 'זן', size: '12', boxes: 100, weight: 600, firstOfPallet: true }],
    palletCount: 1, totalBoxes: 100, totalWeight: 600,
  };
}

async function loadPdfMake() {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('../../fonts/vfs_fonts.js'),
  ]);
  pdfMake.vfs = pdfFonts;
  pdfMake.fonts = { Rubik: { normal: 'Rubik-VariableFont_wght.ttf', bold: 'Rubik-Bold.ttf' } };
  return pdfMake;
}

// Tablet: native share sheet (→ Wi-Fi printer). PC: open in a new tab; fallback download.
export async function printCertificates(snapshots, filename) {
  const pdfMake = await loadPdfMake();
  const pdf = pdfMake.createPdf(buildCertificateDoc(snapshots));
  const blob = await new Promise((resolve) => pdf.getBlob(resolve));
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename }); // throws on cancel/failure — caller decides
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'opened';
  }
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
