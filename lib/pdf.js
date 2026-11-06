import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { JAKOBSON_LOGO_BLACK_PNG_BASE64 } from "./logo.js";
import { embedArtworkImage } from "./artwork-image.js";

const A4 = [595.276, 841.89];
const BLACK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.36, 0.36, 0.36);
const LIGHT_GREY = rgb(0.86, 0.84, 0.8);
const CUSTOMS_RED = rgb(0.72, 0.05, 0.05);

function sanitize(text) {
  return String(text || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[×]/g, "x")
    .replace(/[€]/g, "EUR");
}

function wrapText(text, maxChars) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawText(page, text, x, y, options = {}) {
  page.drawText(sanitize(text), {
    x,
    y,
    size: options.size || 10,
    font: options.font,
    color: options.color || BLACK,
    lineHeight: options.lineHeight || 12
  });
}

function drawMultiline(page, text, x, y, options = {}) {
  const lines = sanitize(text).split("\n").filter((line) => line.trim());
  const lineHeight = options.lineHeight || 13;
  lines.forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, options);
  });
  return y - lines.length * lineHeight;
}

async function embedLogo(pdfDoc, page, bold) {
  try {
    const bytes = Buffer.from(JAKOBSON_LOGO_BLACK_PNG_BASE64, "base64");
    const image = await pdfDoc.embedPng(bytes);
    const width = 175;
    const height = width * (image.height / image.width);
    page.drawImage(image, { x: 50, y: 762, width, height });
  } catch {
    drawText(page, "JAKOBSON GALLERY", 50, 782, { font: bold, size: 17 });
  }
}

async function embedImageBox(pdfDoc, page, imageUrl, box, imagePromise = null) {
  if (!imageUrl) return;

  try {
    const image = imagePromise ? await imagePromise : await embedArtworkImage(pdfDoc, imageUrl);
    if (!image) return;

    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderColor: LIGHT_GREY,
      borderWidth: 0.5
    });

    page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height
    });
  } catch {
    // Keep generating the invoice even if the source image cannot be embedded.
  }
}

function artworkDetailLines(artwork) {
  const currentYear = new Date().getFullYear();
  return [
    artwork.artist,
    [artwork.year, artwork.technique].filter(Boolean).join(" - "),
    artwork.dimensions,
    artwork.edition ? `ÉDITION / EDITION: ${artwork.edition}` : "",
    `ANNÉE / YEAR: ${currentYear} - ORIGINE / ORIGIN: FRANCE`
  ].filter(Boolean);
}

function drawArtworkText(page, artwork, index, x, y, fonts) {
  const title = (artwork.title || `OEUVRE ${index + 1}`).toUpperCase();
  const titleLines = wrapText(title, 34);

  titleLines.forEach((line, lineIndex) => {
    drawText(page, line, x, y - lineIndex * 12, {
      font: fonts.bold,
      size: 10
    });
  });

  let cursor = y - titleLines.length * 12 - 2;
  for (const line of artworkDetailLines(artwork)) {
    const isCustomsLine = line.startsWith("ANNÉE / YEAR:");
    for (const part of wrapText(line, isCustomsLine ? 55 : 44)) {
      drawText(page, part, x, cursor, {
        font: isCustomsLine ? fonts.bold : fonts.regular,
        size: isCustomsLine ? 7.8 : 8.5,
        color: isCustomsLine ? BLACK : GREY
      });
      cursor -= isCustomsLine ? 9.5 : 10.5;
    }
  }

  return cursor;
}

function drawCustomsStatements(page, statements, fonts, baseKey) {
  const items = Array.isArray(statements) ? statements.filter(Boolean) : [];
  if (!items.length) return;

  const isSaintTropez = baseKey === "saint-tropez";
  const customsX = isSaintTropez ? 365 : 300;
  const maxChars = isSaintTropez ? 40 : 58;

  drawText(page, "CUSTOMS / US IMPORT", customsX, 96, {
    font: fonts.bold,
    size: 7.2,
    color: CUSTOMS_RED
  });

  let y = 83;
  for (const statement of items) {
    for (const line of wrapText(statement, maxChars)) {
      drawText(page, line, customsX, y, {
        font: fonts.regular,
        size: 6.4,
        color: CUSTOMS_RED
      });
      y -= 7.5;
    }
    y -= 3;
  }
}

async function drawArtworks(pdfDoc, firstPage, data, fonts, initialTop = 522) {
  const artworks = (data.artworks?.length ? data.artworks : [data.artwork]).filter(Boolean);
  let page = firstPage;
  let cursor = initialTop;
  const imagePromises = artworks.map((artwork) =>
    artwork.imageUrl ? embedArtworkImage(pdfDoc, artwork.imageUrl).catch(() => null) : null
  );
  const newPage = () => {
    page = pdfDoc.addPage(A4);
    cursor = 770;
    drawText(page, "FACTURE / INVOICE N° " + data.invoiceNumber + " - SUITE", 50, 798, { font: fonts.bold, size: 11 });
    page.drawLine({ start: { x: 50, y: 785 }, end: { x: 545, y: 785 }, thickness: 0.8, color: LIGHT_GREY });
  };
  for (let index = 0; index < artworks.length; index += 1) {
    const artwork = artworks[index];
    const title = wrapText((artwork.title || "OEUVRE " + (index + 1)).toUpperCase(), 34);
    const details = artworkDetailLines(artwork).flatMap((line) => {
      const customs = line.startsWith("ANNÉE / YEAR:");
      return wrapText(line, customs ? 38 : 38).map((text) => ({ text, customs }));
    });
    const textHeight = title.length * 13 + 5 + details.reduce((sum, line) => sum + (line.customs ? 10 : 11), 0);
    const imageHeight = artworks.length === 1 ? 160 : 110;
    const rowHeight = Math.max(textHeight, imageHeight) + 22;
    if (cursor - rowHeight < 100) newPage();
    const top = cursor;
    if (artworks.length > 1) drawText(page, (index + 1) + ".", 50, top, { font: fonts.bold, size: 9 });
    let y = top;
    for (const line of title) { drawText(page, line, 68, y, { font: fonts.bold, size: 10 }); y -= 13; }
    y -= 5;
    for (const line of details) {
      drawText(page, line.text, 68, y, { font: line.customs ? fonts.bold : fonts.regular, size: line.customs ? 7.8 : 8.5, color: line.customs ? BLACK : GREY });
      y -= line.customs ? 10 : 11;
    }
    await embedImageBox(pdfDoc, page, artwork.imageUrl, {
      x: 350, y: top - imageHeight + 5, width: 190, height: imageHeight - 5
    }, imagePromises[index]);
    cursor -= rowHeight;
    page.drawLine({ start: { x: 50, y: cursor + 10 }, end: { x: 545, y: cursor + 10 }, thickness: 0.45, color: LIGHT_GREY });
  }
  // Reserve an entire final page for the financial summary when needed.
  if (cursor < 360) newPage();
  drawText(page, "TOTAL " + (data.taxMode || "TTC"), 50, cursor - 12, { font: fonts.bold, size: 10 });
  drawText(page, data.totals.priceLabel, 400, cursor - 12, { font: fonts.bold, size: 12 });
  return { page, summaryStart: Math.min(290, cursor - 55) };
}

export async function createInvoicePdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(A4);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) });

  await embedLogo(pdfDoc, page, bold);

  drawText(
    page,
    data.baseKey === "saint-tropez"
      ? data.invoiceNumber
      : `FACTURE / INVOICE N° ${data.invoiceNumber}`,
    330,
    788,
    { font: bold, size: 15 }
  );
  drawText(page, data.date, 330, 766, { font: regular, size: 10, color: GREY });

  page.drawLine({
    start: { x: 50, y: 720 },
    end: { x: 545, y: 720 },
    thickness: 0.8,
    color: LIGHT_GREY
  });

  drawMultiline(
    page,
    `${data.gallery.address}\n${data.gallery.phone}\n${data.gallery.website}\n${data.gallery.email}`,
    50,
    690,
    { font: regular, size: 9, color: BLACK, lineHeight: 13 }
  );

  drawText(page, "CLIENT / CUSTOMER", 330, 690, { font: bold, size: 10 });
  const clientBlock =
    data.baseKey === "saint-tropez"
      ? `${data.client.name}\n${data.client.address}\n${data.client.email}\n${data.client.phone}`.toUpperCase()
      : `${data.client.name}\n${data.client.address}\n${data.client.email}\n${data.client.phone}`;

  drawMultiline(
    page,
    clientBlock,
    330,
    668,
    { font: regular, size: 9, color: BLACK, lineHeight: 13 }
  );

  const layout = await drawArtworks(pdfDoc, page, data, fonts, Math.min(522, 668 - clientBlock.split("\n").filter(Boolean).length * 13 - 50));
  const summaryPage = layout.page;
  const summaryStart = layout.summaryStart;
  summaryPage.drawLine({
    start: { x: 50, y: summaryStart + 18 },
    end: { x: 545, y: summaryStart + 18 },
    thickness: 0.8,
    color: LIGHT_GREY
  });

  const summaryLeft = [
    data.taxMode === "HT" ? "PRIX HT / TOTAL HT" : "PRIX TTC / TOTAL TTC",
    "ACOMPTE / DÉJÀ PAYÉ",
    "NOUVEAU RÈGLEMENT",
    "TOTAL ENCAISSÉ / TOTAL PAID",
    "SOLDE RESTANT / BALANCE",
    "MODE DE RÈGLEMENT / PAYMENT"
  ];

  const summaryRight = [
    data.totals.priceLabel,
    data.totals.paidBeforeLabel,
    data.totals.newPaymentLabel,
    data.totals.totalPaidLabel,
    data.totals.balanceLabel,
    data.paymentMode
  ];

  summaryLeft.forEach((label, index) => {
    const y = summaryStart - index * 20;
    drawText(summaryPage, label, 50, y, { font: bold, size: 8.3 });
    drawText(summaryPage, summaryRight[index], 340, y, {
      font: index === 4 ? bold : regular,
      size: 9.2
    });
  });

  const bankLineY = Math.max(92, summaryStart - 128);
  summaryPage.drawLine({
    start: { x: 50, y: bankLineY },
    end: { x: 545, y: bankLineY },
    thickness: 0.8,
    color: LIGHT_GREY
  });

  drawText(summaryPage, "COORDONNÉES BANCAIRES / BANK DETAILS", 50, bankLineY - 22, {
    font: bold,
    size: 9.5
  });

  drawMultiline(
    summaryPage,
    `${data.gallery.bank}\n${data.gallery.iban}\n${data.gallery.bic}`,
    50,
    bankLineY - 42,
    { font: regular, size: 8.5, lineHeight: 11 }
  );

  drawCustomsStatements(summaryPage, data.customsStatements, fonts, data.baseKey);

  drawText(summaryPage, data.gallery.legal, 50, 30, {
    font: regular,
    size: 7.5,
    color: GREY
  });

  return pdfDoc.save();
}
