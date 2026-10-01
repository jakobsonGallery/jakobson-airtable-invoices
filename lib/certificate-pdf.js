import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { JAKOBSON_LOGO_BLACK_PNG_BASE64 } from "./logo.js";

const A4 = [595.276, 841.89];
const BLACK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.38, 0.38, 0.38);
const LIGHT = rgb(0.86, 0.84, 0.8);
const GOLD = rgb(0.61, 0.49, 0.28);

function sanitize(text) {
  return String(text || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[×]/g, "x");
}

function wrapText(text, maxChars = 56) {
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
    color: options.color || BLACK
  });
}

function drawWrapped(page, text, x, y, options = {}) {
  const lines = wrapText(text, options.maxChars || 56);
  const lineHeight = options.lineHeight || 13;
  lines.forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, options);
  });
  return y - lines.length * lineHeight;
}

async function drawLogo(pdfDoc, page, bold) {
  try {
    const bytes = Buffer.from(JAKOBSON_LOGO_BLACK_PNG_BASE64, "base64");
    const image = await pdfDoc.embedPng(bytes);
    const width = 170;
    const height = width * (image.height / image.width);
    page.drawImage(image, { x: 50, y: 760, width, height });
  } catch {
    drawText(page, "JAKOBSON GALLERY", 50, 785, { font: bold, size: 17 });
  }
}

async function drawArtworkImage(pdfDoc, page, imageUrl) {
  const box = { x: 50, y: 350, width: 235, height: 265 };

  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderColor: LIGHT,
    borderWidth: 0.6
  });

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

    page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height
    });
  } catch {
    // The certificate remains valid even if the source image is temporarily unavailable.
  }
}

function drawDetail(page, label, value, y, fonts) {
  if (!value) return y;

  drawText(page, label, 320, y, {
    font: fonts.bold,
    size: 8.3,
    color: GOLD
  });

  const next = drawWrapped(page, value, 320, y - 17, {
    font: fonts.regular,
    size: 10.5,
    color: BLACK,
    maxChars: 35,
    lineHeight: 13
  });

  return next - 13;
}

function certificateStatement(artist, title) {
  const work = title ? `"${title}"` : "the artwork described on this certificate";
  if (artist) {
    return `Jakobson Gallery certifies that ${work} is an authentic work by ${artist}, represented and sold by the gallery.`;
  }
  return `Jakobson Gallery certifies that ${work} is an authentic artwork represented and sold by the gallery.`;
}

export async function createCertificatePdf(data) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  for (const artwork of data.artworks || []) {
    const page = pdfDoc.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) });

    await drawLogo(pdfDoc, page, bold);

    drawText(page, "CERTIFICATE OF AUTHENTICITY", 50, 700, {
      font: bold,
      size: 18
    });

    page.drawLine({
      start: { x: 50, y: 681 },
      end: { x: 545, y: 681 },
      thickness: 1,
      color: GOLD
    });

    await drawArtworkImage(pdfDoc, page, artwork.imageUrl);

    let cursor = 592;
    cursor = drawDetail(page, "ARTIST / ARTISTE", artwork.artist, cursor, fonts);
    cursor = drawDetail(page, "TITLE / TITRE", artwork.title, cursor, fonts);
    cursor = drawDetail(page, "YEAR / ANNÉE", artwork.year, cursor, fonts);
    cursor = drawDetail(page, "TECHNIQUE", artwork.technique, cursor, fonts);
    cursor = drawDetail(page, "DIMENSIONS", artwork.dimensions, cursor, fonts);
    cursor = drawDetail(page, "EDITION / TIRAGE", artwork.edition, cursor, fonts);

    page.drawLine({
      start: { x: 50, y: 318 },
      end: { x: 545, y: 318 },
      thickness: 0.6,
      color: LIGHT
    });

    drawWrapped(page, certificateStatement(artwork.artist, artwork.title), 50, 288, {
      font: regular,
      size: 10.2,
      color: BLACK,
      maxChars: 88,
      lineHeight: 14
    });

    drawText(page, "COLLECTOR / COLLECTIONNEUR", 50, 205, {
      font: bold,
      size: 8.3,
      color: GOLD
    });
    drawText(page, data.collector || "—", 50, 187, {
      font: regular,
      size: 10.5
    });

    drawText(page, "ISSUED / ÉTABLI", 50, 153, {
      font: bold,
      size: 8.3,
      color: GOLD
    });
    drawText(page, `${data.place} — ${data.date}`, 50, 135, {
      font: regular,
      size: 10
    });

    page.drawLine({
      start: { x: 355, y: 142 },
      end: { x: 545, y: 142 },
      thickness: 0.7,
      color: BLACK
    });
    drawText(page, "JAKOBSON GALLERY", 355, 124, {
      font: bold,
      size: 9.5
    });
    drawText(page, "Gallery authentication", 355, 109, {
      font: regular,
      size: 8.5,
      color: GREY
    });

    page.drawLine({
      start: { x: 50, y: 79 },
      end: { x: 545, y: 79 },
      thickness: 0.5,
      color: LIGHT
    });

    drawText(page, data.gallery.address.replace(/\n/g, " · "), 50, 59, {
      font: regular,
      size: 7.8,
      color: GREY
    });
    drawText(page, `${data.gallery.website} · ${data.gallery.email}`, 50, 44, {
      font: regular,
      size: 7.8,
      color: GREY
    });
  }

  return pdfDoc.save();
}
