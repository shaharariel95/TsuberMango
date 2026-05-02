async function createStickerPDF(data = {}) {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("../../fonts/vfs_fonts.js"),
  ]);

  pdfMake.vfs = pdfFonts;
  pdfMake.fonts = {
    Rubik: {
      normal: "Rubik-VariableFont_wght.ttf",
      bold: "Rubik-Bold.ttf",
    },
  };
  const {
    platformNumber = "",
    farmer = "",
    size = "",
    variety = "",
    quantity = "",
    weight = "",
  } = data;

  const docDefinition = {
    pageSize: { width: 812, height: 1218 },
    pageMargins: [10, 40, 90, 40],
    defaultStyle: {
      font: "Rubik",
      fontSize: 100,
      alignment: "right",
    },
    textDirection: "rtl",
    content: [
      {
        layout: "noBorders",
        table: {
          widths: ["auto", "*"],
          body: [
            ["משטח:", platformNumber],
            ["מגדל:", farmer.replace(/\s/g, "-")],
            ["גודל:", size],
            ["זן:", variety],
            ["כמות:", quantity],
            ["משקל:", weight],
          ].map(([label, value]) => [
            {
              stack: [
                { text: value || " ", alignment: "center", fontSize: 100, bold: true },
                {
                  canvas: [
                    {
                      type: "line",
                      x1: 0,
                      y1: 5,
                      x2: 425,
                      y2: 5,
                      lineWidth: 3,
                    },
                  ],
                },
              ],
              alignment: "center",
              margin: [10, 30, 10, 30],
            },
            {
              text: label,
              bold: true,
              alignment: "right",
              margin: [10, 30, 10, 30],
            },
          ]),
        },
      },
    ],
  };

  pdfMake
    .createPdf(docDefinition)
    .download(`${platformNumber || "sticker"}.pdf`);
}

export default createStickerPDF;
