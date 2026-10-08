// Shipping certificate (תעודת משלוח) PDF. buildCertificateDoc is pure (unit-tested);
// printCertificates lazy-loads pdfmake + the Rubik font like the sticker printer does.
const RED = '#dc2626';
const BODY_ROWS = 13;
const COLUMNS = ['מחיר', 'כמות משטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"]; // left→right on paper = right-to-left reading
const WIDTHS = [45, 50, 50, 45, 65, 55, 35, 70, 60];

const cell = (text, extra = {}) => ({ text: text === undefined || text === null ? '' : String(text), alignment: 'center', ...extra });

function rowCells(row) {
  if (!row) return COLUMNS.map(() => cell(''));
  return [cell(''), cell(row.firstOfPallet ? 1 : ''), cell(row.weight), cell(row.boxes), cell(''), cell(''),
    cell(row.size), cell(row.kind), cell(row.palletNumber)];
}

function certificatePage(s, index) {
  if (s.rows.length > BODY_ROWS) throw new Error(`certificate ${s.number} has ${s.rows.length} rows; max ${BODY_ROWS}`);
  const [title = '', ...lines] = s.headerLines || [];
  const body = [COLUMNS.map(h => cell(h, { bold: true, fillColor: '#f1f5f9' }))];
  for (let i = 0; i < BODY_ROWS; i++) body.push(rowCells(s.rows[i]));
  return [
    { text: title, fontSize: 30, bold: true, alignment: 'center', ...(index > 0 ? { pageBreak: 'before' } : {}) },
    ...lines.map((l, i) => ({ text: l, fontSize: i === 0 ? 11 : 9, bold: i === 0, alignment: 'center', margin: [0, 1, 0, 1] })),
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 1 }, { type: 'line', x1: 0, y1: 7, x2: 515, y2: 7, lineWidth: 1 }], margin: [0, 2, 0, 8] },
    { columns: [
      { text: [{ text: s.shipmentDate || '' }, { text: '   תאריך', bold: true }], alignment: 'left' },
      { text: [{ text: "מגדל מס':", bold: true }], alignment: 'right' },
    ], margin: [0, 0, 0, 6] },
    { text: [{ text: String(s.number), bold: true, color: RED, fontSize: 18 }, { text: "   סמ'   " }, { text: 'תעודת משלוח', bold: true, fontSize: 14 }], alignment: 'center', margin: [0, 0, 0, 6] },
    { text: [{ text: s.destination || '', bold: true, fontSize: 15, decoration: 'underline' }, { text: '  :עבור', fontSize: 10 }], alignment: 'right', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: WIDTHS, heights: (i) => (i === 0 ? 28 : 22), body }, layout: { hLineWidth: () => 1, vLineWidth: () => 1 } },
    { table: { widths: [45, 50, 50, '*'], body: [[cell(''), cell(s.palletCount, { bold: true }), cell('סה"כ משטחים', { fontSize: 9 }), cell('תוצרת מעושרת / נשלח מעשר', { alignment: 'right' })]] },
      layout: 'noBorders', margin: [0, 4, 0, 4] },
    { text: 'כמות מעשר', alignment: 'right', fontSize: 10, margin: [0, 2, 0, 6] },
    { columns: [
      { text: 'שעת יציאה', fontSize: 10 }, { text: 'רכב מס', fontSize: 10 },
      { text: s.driverName || '', alignment: 'center', fontSize: 11 }, { text: 'שם המוביל', alignment: 'right', fontSize: 10 },
    ], margin: [0, 6, 0, 6] },
    { columns: [
      { text: 'שעה', fontSize: 10 }, { text: 'חתימה', fontSize: 10 }, { text: '' }, { text: 'נפרק על-ידי', alignment: 'right', fontSize: 10 },
    ] },
  ];
}

export function buildCertificateDoc(snapshots) {
  return {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: 'Rubik', fontSize: 11, alignment: 'right' },
    textDirection: 'rtl',
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
