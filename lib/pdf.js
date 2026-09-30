import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { JAKOBSON_LOGO_BLACK_PNG_BASE64 } from "./logo.js";

const A4 = [595.276, 841.89];
const BLACK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.36, 0.36, 0.36);
const LIGHT_GREY = rgb(0.86, 0.84, 0.8);

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

async function embedImageBox(pdfDoc, page, imageUrl, box) {
  if (!imageUrl) return;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const image = contentType.includes("png")
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

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
  return [
    artwork.artist,
    [artwork.year, artwork.technique].filter(Boolean).join(" - "),
    artwork.dimensions,
    artwork.edition ? `ÉDITION / EDITION: ${artwork.edition}` : ""
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
    for (const part of wrapText(line, 39)) {
      drawText(page, part, x, cursor, {
        font: fonts.regular,
        size: 8.5,
        color: GREY
      });
      cursor -= 10.5;
    }
  }

  return cursor;
}

async function drawArtworks(pdfDoc, page, data, fonts) {
  const artworks = (data.artworks && data.artworks.length ? data.artworks : [data.artwork]).filter(Boolean);
  const multiple = artworks.length > 1;

  page.drawLine({
    start: { x: 50, y: 575 },
    end: { x: 545, y: 575 },
    thickness: 0.8,
    color: LIGHT_GREY
  });

  drawText(
    page,
    multiple ? "DÉSIGNATION / DESCRIPTION DES OEUVRES" : "DÉSIGNATION / DESCRIPTION",
    50,
    550,
    { font: fonts.bold, size: 10 }
  );

  let cursor = 522;
  const visibleArtworks = artworks.slice(0, 4);

  for (let index = 0; index < visibleArtworks.length; index += 1) {
    const artwork = visibleArtworks[index];
    const imageBox = {
      x: 400,
      y: cursor - 50,
      width: 145,
      height: 52
    };

    if (multiple) {
      drawText(page, `${index + 1}.`, 50, cursor, {
        font: fonts.bold,
        size: 9
      });
    }

    const textX = multiple ? 68 : 50;
    const textBottom = drawArtworkText(page, artwork, index, textX, cursor, fonts);
    await embedImageBox(pdfDoc, page, artwork.imageUrl, imageBox);

    const rowBottom = Math.min(textBottom, imageBox.y);
    cursor = rowBottom - 12;
  }

  if (artworks.length > visibleArtworks.length) {
    drawText(
      page,
      `+ ${artworks.length - visibleArtworks.length} oeuvre(s) supplémentaire(s)`,
      68,
      cursor,
      { font: fonts.regular, size: 8.5, color: GREY }
    );
    cursor -= 18;
  }

  const totalY = Math.max(cursor - 4, 275);
  page.drawLine({
    start: { x: 50, y: totalY + 18 },
    end: { x: 545, y: totalY + 18 },
    thickness: 0.5,
    color: LIGHT_GREY
  });
  drawText(page, "TOTAL", 50, totalY, { font: fonts.bold, size: 10 });
  drawText(page, data.totals.priceLabel, 400, totalY, { font: fonts.bold, size: 12 });

  return totalY - 24;
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
  drawMultiline(
    page,
    `${data.client.name}\n${data.client.address}\n${data.client.email}\n${data.client.phone}`,
    330,
    668,
    { font: regular, size: 9, color: BLACK, lineHeight: 13 }
  );

  const artworkBottom = await drawArtworks(pdfDoc, page, data, fonts);

  const summaryStart = Math.min(245, artworkBottom - 10);
  page.drawLine({
    start: { x: 50, y: summaryStart + 18 },
    end: { x: 545, y: summaryStart + 18 },
    thickness: 0.8,
    color: LIGHT_GREY
  });

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
    const y = summaryStart - index * 20;
    drawText(page, label, 50, y, { font: bold, size: 8.3 });
    drawText(page, summaryRight[index], 340, y, {
      font: index === 4 ? bold : regular,
      size: 9.2
    });
  });

  const bankLineY = Math.max(92, summaryStart - 128);
  page.drawLine({
    start: { x: 50, y: bankLineY },
    end: { x: 545, y: bankLineY },
    thickness: 0.8,
    color: LIGHT_GREY
  });

  drawText(page, "COORDONNÉES BANCAIRES / BANK DETAILS", 50, bankLineY - 22, {
    font: bold,
    size: 9.5
  });

  drawMultiline(
    page,
    `${data.gallery.bank}\n${data.gallery.iban}\n${data.gallery.bic}`,
    50,
    bankLineY - 42,
    { font: regular, size: 8.5, lineHeight: 11 }
  );

  drawText(page, data.gallery.legal, 50, 30, {
    font: regular,
    size: 7.5,
    color: GREY
  });

  return pdfDoc.save();
}
