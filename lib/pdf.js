import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.276, 841.89];
const BLACK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.36, 0.36, 0.36);
const LIGHT_GREY = rgb(0.86, 0.84, 0.8);
const GOLD = rgb(0.68, 0.54, 0.28);

function sanitize(text) {
  return String(text || "")
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

async function embedArtworkImage(pdfDoc, page, imageUrl) {
  if (!imageUrl) return;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const image = contentType.includes("png")
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const maxWidth = 165;
    const maxHeight = 135;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawRectangle({
      x: 390,
      y: 350,
      width: 170,
      height: 145,
      borderColor: LIGHT_GREY,
      borderWidth: 0.5
    });
    page.drawImage(image, {
      x: 390 + (170 - width) / 2,
      y: 350 + (145 - height) / 2,
      width,
      height
    });
  } catch {
    // Keep generating the invoice even if the source image cannot be embedded.
  }
}

export async function createInvoicePdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(A4);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 0.992, 0.965) });

  drawText(page, `FACTURE / INVOICE N° ${data.invoiceNumber}`, 50, 788, { font: bold, size: 16 });
  drawText(page, data.date, 50, 766, { font: regular, size: 10, color: GREY });

  drawText(page, "JAKOBSON", 405, 790, { font: serifBold, size: 24 });
  drawText(page, "GALLERY", 410, 767, { font: serif, size: 17, color: GOLD });
  drawText(page, "GALERIE", 430, 748, { font: regular, size: 8, color: GREY });

  page.drawLine({ start: { x: 50, y: 720 }, end: { x: 545, y: 720 }, thickness: 0.8, color: LIGHT_GREY });

  drawMultiline(page, `${data.gallery.address}\n${data.gallery.phone}\n${data.gallery.website}\n${data.gallery.email}`, 50, 690, {
    font: regular,
    size: 9,
    color: BLACK,
    lineHeight: 13
  });

  drawText(page, "CLIENT / CUSTOMER", 330, 690, { font: bold, size: 10 });
  drawMultiline(
    page,
    `${data.client.name}\n${data.client.address}\n${data.client.email}\n${data.client.phone}`,
    330,
    668,
    { font: regular, size: 9, color: BLACK, lineHeight: 13 }
  );

  page.drawLine({ start: { x: 50, y: 575 }, end: { x: 545, y: 575 }, thickness: 0.8, color: LIGHT_GREY });
  drawText(page, "DÉSIGNATION / DESCRIPTION", 50, 550, { font: bold, size: 10 });

  const titleLines = wrapText((data.artwork.title || "").toUpperCase(), 29);
  titleLines.forEach((line, index) => {
    drawText(page, line, 50, 520 - index * 16, { font: bold, size: 14 });
  });

  const detailY = 496 - Math.max(0, titleLines.length - 1) * 16;
  const details = [
    data.artwork.artist,
    [data.artwork.year, data.artwork.technique].filter(Boolean).join(" - "),
    data.artwork.dimensions
  ].filter(Boolean);
  drawMultiline(page, details.join("\n"), 50, detailY, { font: regular, size: 10, color: GREY, lineHeight: 14 });

  drawText(page, data.totals.priceLabel, 300, 520, { font: bold, size: 12 });
  await embedArtworkImage(pdfDoc, page, data.artwork.imageUrl);

  page.drawLine({ start: { x: 50, y: 325 }, end: { x: 545, y: 325 }, thickness: 0.8, color: LIGHT_GREY });

  const summaryLeft = [
    "PRIX TTC / TOTAL",
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
    const y = 300 - index * 22;
    drawText(page, label, 50, y, { font: bold, size: 8.5 });
    drawText(page, summaryRight[index], 340, y, { font: index === 4 ? bold : regular, size: 9.5 });
  });

  page.drawLine({ start: { x: 50, y: 155 }, end: { x: 545, y: 155 }, thickness: 0.8, color: LIGHT_GREY });
  drawText(page, "COORDONNÉES BANCAIRES / BANK DETAILS", 50, 132, { font: bold, size: 10 });
  drawMultiline(page, `${data.gallery.bank}\n${data.gallery.iban}\n${data.gallery.bic}`, 50, 112, {
    font: regular,
    size: 9,
    lineHeight: 12
  });

  drawText(page, data.gallery.legal, 50, 42, { font: regular, size: 8, color: GREY });

  return pdfDoc.save();
}
