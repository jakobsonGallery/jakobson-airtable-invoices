import sharp from "sharp";

/**
 * Normalize EXIF orientation and downsize large artwork photos before embedding.
 * An original camera image can be tens of megapixels; embedding a full-size PNG
 * needlessly makes certificate generation slow and can time out Airtable.
 */
export async function embedArtworkImage(pdfDoc, imageUrl) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Artwork image unavailable (HTTP ${response.status})`);

  const input = Buffer.from(await response.arrayBuffer());
  const normalized = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: false })
    .toBuffer();

  return pdfDoc.embedJpg(normalized);
}
