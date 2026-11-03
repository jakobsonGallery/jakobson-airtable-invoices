import sharp from "sharp";

/**
 * Apply EXIF orientation to the actual pixels before pdf-lib embeds the image.
 * This avoids sideways artwork in invoices and certificates.
 */
export async function embedArtworkImage(pdfDoc, imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Artwork image unavailable");

  const input = Buffer.from(await response.arrayBuffer());
  const normalized = await sharp(input, { failOn: "error" })
    .rotate()
    .png()
    .toBuffer();

  return pdfDoc.embedPng(normalized);
}
