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

const LINE_H = 13; // approx. Rubik 11pt line height; used to centre cell text vertically (pdfmake 0.2 has no valign)
const HEAD_H = 32;
const ROW_H = 22;
const THICK = 2;
const cell = (text, extra = {}) => txt(text, { alignment: 'center', ...extra });
const vcell = (text, h, lines = 1, extra = {}) => cell(text, { margin: [0, Math.max(0, (h - lines * LINE_H) / 2), 0, 0], ...extra });

function rowCells(row) {
  const c = (t) => vcell(t, ROW_H);
  if (!row) return COLUMNS.map(() => c(''));
  return [c(''), c(row.firstOfPallet ? 1 : ''), c(row.weight), c(row.boxes), c(''), c(''),
    c(row.size), c(row.kind), c(row.palletNumber)];
}

const NB = [false, false, false, false];
const BOX = [true, true, true, true];
const LINE = [false, false, false, true];
const blank = (extra = {}) => ({ text: '', border: NB, ...extra });
const label = (t, extra = {}) => ({ ...txt(t, { fontSize: 10, alignment: 'right', margin: [0, 9, 0, 0], ...extra }), border: NB }); // margin: sit on the row's underline
const fill = (text = '', extra = {}) => ({ ...(text ? txt(text, { fontSize: 11, alignment: 'center', margin: [0, 8, 0, 0] }) : { text: '' }), border: LINE, ...extra });
const noPad = { paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 };

function certificatePage(s, index) {
  if (s.rows.length > BODY_ROWS) throw new Error(`certificate ${s.number} has ${s.rows.length} rows; max ${BODY_ROWS}`);
  const [title = '', ...rest] = s.headerLines || [];
  const lines = [...rest, '', '', '', ''].slice(0, 4); // lines 2-5, positional
  const [l2, l3, l4, l5] = lines;
  const head = [];
  const push = (t, props, margin) => { if (t) head.push({ ...txt(t, props), alignment: 'center', margin }); };
  const first = { ...txt(title, { fontSize: 30, bold: true }), alignment: 'center', margin: [0, 0, 0, 0] };
  const body = [COLUMNS.map((h, i) => vcell(i === 1 ? h.replace(' ', '\n') : h, HEAD_H, i === 1 ? 2 : 1, { bold: true }))];
  for (let i = 0; i < BODY_ROWS; i++) body.push(rowCells(s.rows[i]));
  push(l2, { fontSize: 11, bold: true }, [0, 1, 0, 1]);
  push(l3, { fontSize: 9 }, [0, 1, 0, 1]);
  push(l4, { fontSize: 9 }, [0, 1, 0, 1]);
  const rule = { canvas: [{ type: 'line', x1: 0, y1: 4, x2: CONTENT_W, y2: 4, lineWidth: 1 }, { type: 'line', x1: 0, y1: 7, x2: CONTENT_W, y2: 7, lineWidth: 1 }], margin: [0, 2, 0, 2] };
  const vatLine = l5 ? [{ ...txt(l5, { fontSize: 7 }), alignment: 'center', margin: [0, 0, 0, 4] }] : [];
  const totalsRow = COLUMNS.map(() => blank());
  totalsRow[1] = { table: { widths: ['*'], body: [[{ ...cell(s.palletCount, { bold: true, margin: [0, 3, 0, 3] }) }]] }, layout: { hLineWidth: () => THICK, vLineWidth: () => THICK }, border: NB };
  totalsRow[2] = { ...cell('סה"כ\nמשטחים', { fontSize: 8 }), border: NB };
  totalsRow[4] = { ...txt('תוצרת מעושרת / נשלח מעשר', { alignment: 'right' }), colSpan: 5, border: NB, margin: [0, 8, 0, 0] };
  const fills = { // physical left→right: [line, label, line, label, line, label]
    table: { widths: [70, 50, 95, 55, '*', 70], heights: 24, body: [
      [blank(), blank(), blank(), blank(), fill(), label('כמות מעשר')],
      [fill(), label('שעת יציאה'), fill(), label('רכב מס'), fill(s.driverName), label('שם המוביל')],
      [fill(), label('שעה'), fill(), label('חתימה'), fill(), label('נפרק על-ידי')],
    ] },
    layout: { hLineWidth: () => 1, vLineWidth: () => 0, ...noPad }, margin: [0, 0, 0, 0],
  };
  return [
    { ...first, ...(index > 0 ? { pageBreak: 'before' } : {}) },
    ...head,
    rule,
    ...vatLine,
    { table: { widths: [110, 45, '*', 110, 60], heights: 24, body: [[
      fill(s.shipmentDate || '', { alignment: 'left' }), label('תאריך', { bold: true }), blank(), { text: '', border: BOX }, label("מגדל מס':", { bold: true }),
    ]] }, layout: { hLineWidth: () => 1, vLineWidth: () => 1, ...noPad }, margin: [0, 4, 0, 4] },
    { text: [{ text: String(s.number), bold: true, color: RED, fontSize: 18 }, { text: '   ' }, txt("תעודת משלוח סמ'", { bold: true, fontSize: 14 })], alignment: 'center', margin: [0, 0, 0, 4] },
    { text: [txt(s.destination || '', { bold: true, fontSize: 15, decoration: 'underline' }), { text: ' ' }, txt('עבור:', { fontSize: 10 })], alignment: 'right', margin: [0, 0, 0, 6] },
    { table: { headerRows: 1, widths: WIDTHS, heights: (i) => (i === 0 ? HEAD_H : ROW_H), body },
      layout: { hLineWidth: (i, n) => (i === 0 || i === n.table.body.length ? THICK : 1), vLineWidth: (i, n) => (i === 0 || i === n.table.widths.length ? THICK : 1), paddingTop: () => 0, paddingBottom: () => 0 } },
    { table: { widths: WIDTHS, body: [totalsRow] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0 }, margin: [0, 4, 0, 4] },
    fills,
  ];
}

export function buildCertificateDoc(snapshots) {
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 36],
    defaultStyle: { font: 'Rubik', fontSize: 11, alignment: 'right' },
    background: () => ({ absolutePosition: { x: 0, y: 0 }, alignment: 'left', canvas: [{ type: 'rect', x: 30, y: 26, w: 535, h: 672, lineWidth: 0.75 }] }),
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

let pdfMakePromise = null;
function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('../../fonts/vfs_fonts.js'),
      ]);
      pdfMake.vfs = pdfFonts;
      pdfMake.fonts = { Rubik: { normal: 'Rubik-VariableFont_wght.ttf', bold: 'Rubik-Bold.ttf' } };
      return pdfMake;
    })().catch((e) => { pdfMakePromise = null; throw e; }); // a failed load can be retried
  }
  return pdfMakePromise;
}

// Start loading pdfmake + the font early (idempotent). The first import over Wi-Fi is slow, and a
// share sheet needs a user tap that is at most ~5 s old (transient activation), so the import must not
// eat into that window.
export function preloadPdf() {
  loadPdfMake().catch(() => {});
}

// Thrown when the share sheet refuses because the user's tap is too old (NotAllowedError). Carries the
// ready PDF so the caller can ask for a fresh tap and share it from that click.
export class ShareNeedsTapError extends Error {
  constructor(file) {
    super('SHARE_NEEDS_TAP');
    this.name = 'ShareNeedsTapError';
    this.file = file;
  }
}

// Shares a prepared PDF file. Returns 'shared', or 'cancelled' when the user dismissed the sheet.
export async function shareFile(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
    if (e?.name === 'NotAllowedError') throw new ShareNeedsTapError(file);
    throw e;
  }
}

// Tablet: native share sheet (→ Wi-Fi printer). PC: open in a new tab; fallback download.
// Resolves 'shared' | 'cancelled' | 'opened' | 'downloaded'; throws ShareNeedsTapError (see above).
export async function printCertificates(snapshots, filename) {
  const pdfMake = await loadPdfMake();
  const pdf = pdfMake.createPdf(buildCertificateDoc(snapshots));
  const blob = await new Promise((resolve) => pdf.getBlob(resolve));
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    return shareFile(file); // other failures propagate — caller decides
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

// printCertificates plus the fresh-tap fallback: if the browser refuses the share for lack of a recent
// tap, ask for one with a confirm dialog and share the already-built file from that click.
export async function printWithRetap(snapshots, filename, requestConfirm) {
  try {
    return await printCertificates(snapshots, filename);
  } catch (e) {
    if (!(e instanceof ShareNeedsTapError)) throw e;
    const ok = await requestConfirm({ title: 'הדפסה', message: 'התעודה מוכנה להדפסה', confirmText: 'הדפס' });
    if (!ok) return 'cancelled';
    return shareFile(e.file);
  }
}
