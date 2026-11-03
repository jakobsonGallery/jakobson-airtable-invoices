import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { embedArtworkImage } from "../lib/artwork-image.js";
import { createInvoicePdf } from "../lib/pdf.js";
import { createCertificatePdf } from "../lib/certificate-pdf.js";
import { invoiceFilename } from "../lib/invoice-data.js";

const gallery = {
  name: "JAKOBSON GALLERY",
  address: "28 place des Vosges\nParis, France",
  phone: "+33 1 00 00 00 00",
  email: "test@example.invalid",
  website: "www.example.invalid",
  bank: "Banque",
  iban: "TEST IBAN",
  bic: "TEST BIC",
  legal: "Galerie test"
};

function artwork(imageUrl = null) {
  return {
    title: "APOLLINE",
    artist: "VALERIE HADIDA",
    year: "2026",
    technique: "BRONZE",
    dimensions: "50 x 30 x 20 cm",
    edition: "1/8",
    imageUrl
  };
}

function invoice(baseKey = "paris", images = []) {
  const artworks = images.length ? images.map((url) => artwork(url)) : [artwork()];
  return {
    baseKey,
    recordId: "recTEST1234567890",
    invoiceNumber: "FACT. 128",
    date: "03/11/2026",
    gallery,
    client: { name: "TEST CLIENT", address: "Paris", email: "", phone: "" },
    artwork: artworks[0],
    artworks,
    totals: {
      priceLabel: "12 000,00 EUR",
      paidBeforeLabel: "2 000,00 EUR",
      newPaymentLabel: "1 000,00 EUR",
      totalPaidLabel: "3 000,00 EUR",
      balanceLabel: "9 000,00 EUR"
    },
    paymentMode: "Virement bancaire",
    taxMode: "TTC",
    customsStatements: []
  };
}

test("Paris invoice renders one A4 PDF page without touching Airtable", async () => {
  const bytes = await createInvoicePdf(invoice("paris"));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(bytes.length > 1000);
});

test("Saint-Tropez invoice renders one A4 PDF page", async () => {
  const bytes = await createInvoicePdf(invoice("saint-tropez"));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(bytes.length > 1000);
});

test("Certificate renders without a network connection", async () => {
  const bytes = await createCertificatePdf({
    gallery,
    collector: "TEST COLLECTOR",
    place: "Paris",
    date: "03/11/2026",
    artworks: [artwork()]
  });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});

test("Invoice filename and document type stay unchanged", () => {
  assert.match(invoiceFilename(invoice("paris")), /^FACT_.*\\.pdf$/);
  assert.match(invoiceFilename(invoice("saint-tropez")), /\\.pdf$/);
});

test("EXIF orientation is applied before PDF embedding", async () => {
  const source = await sharp({
    create: { width: 120, height: 60, channels: 3, background: "#deac79" }
  }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.equal((await sharp(source).metadata()).orientation, 6);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(source, { status: 200 });
    const image = await embedArtworkImage(await PDFDocument.create(), "https://example.invalid/art.jpg");
    assert.equal(image.width, 60);
    assert.equal(image.height, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Multi-artwork invoice loads image URLs concurrently", async () => {
  const source = await sharp({
    create: { width: 100, height: 140, channels: 3, background: "#deac79" }
  }).jpeg().toBuffer();
  let active = 0;
  let peak = 0;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return new Response(source, { status: 200 });
    };
    const data = invoice("paris", [
      "https://example.invalid/a.jpg",
      "https://example.invalid/b.jpg",
      "https://example.invalid/c.jpg",
      "https://example.invalid/d.jpg"
    ]);
    const pdf = await PDFDocument.load(await createInvoicePdf(data));
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(peak >= 2, "image URLs must download in parallel");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
