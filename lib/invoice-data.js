import { getBaseConfig } from "./config.js";
import { airtableGet, asText, attachmentUrl, firstLinkedRecordId } from "./airtable.js";

function joinAddress(parts) {
  return parts.filter(Boolean).join("\n");
}

function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
}

function paymentText(value) {
  const raw = asText(value).trim();
  if (!raw) return "Virement bancaire / Bank transfer";
  return raw;
}

export async function loadInvoiceData(baseKey, recordId) {
  const config = getBaseConfig(baseKey);
  const f = config.fields;

  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const purchaseFields = purchase.fields || {};

  const clientId = firstLinkedRecordId(purchaseFields[f.clientLink]);
  const artworkId = firstLinkedRecordId(purchaseFields[f.artworkLink]);

  const [client, artwork] = await Promise.all([
    clientId ? airtableGet(config.baseId, config.tables.clients, clientId) : null,
    artworkId ? airtableGet(config.baseId, config.tables.artworks, artworkId) : null
  ]);

  const clientFields = client?.fields || {};
  const artworkFields = artwork?.fields || {};

  const invoiceNumber = f.invoiceNumber ? purchaseFields[f.invoiceNumber] : "";
  const price = Number(purchaseFields[f.price] || 0);
  const paidBefore = Number(purchaseFields[f.paid] || 0);
  const newPayment = Number(purchaseFields[f.newPayment] || 0);
  const totalPaid = paidBefore + newPayment;
  const balance =
    f.balance && purchaseFields[f.balance] !== undefined
      ? Number(purchaseFields[f.balance] || 0)
      : price - totalPaid;

  const clientAddress = joinAddress([
    asText(clientFields[f.clientAddress]),
    [asText(clientFields[f.clientPostcode]), asText(clientFields[f.clientCity])].filter(Boolean).join(" "),
    asText(clientFields[f.clientRegion]),
    asText(clientFields[f.clientCountry])
  ]);

  const technique = f.artworkTechnique ? asText(artworkFields[f.artworkTechnique]) : "";

  return {
    baseKey,
    recordId,
    invoiceNumber: invoiceNumber || recordId.slice(-6).toUpperCase(),
    date: new Date().toLocaleDateString("fr-FR"),
    gallery: config.gallery,
    client: {
      name: asText(clientFields[f.clientName]) || asText(purchaseFields[f.clientLink]),
      address: clientAddress,
      email: asText(clientFields[f.clientEmail]),
      phone: asText(clientFields[f.clientPhone])
    },
    artwork: {
      title: asText(artworkFields[f.artworkTitle]) || asText(purchaseFields[f.artworkLink]),
      artist: asText(artworkFields[f.artworkArtist]) || asText(purchaseFields["Artiste"]),
      year: asText(artworkFields[f.artworkYear]),
      technique,
      dimensions: asText(artworkFields[f.artworkDimensions]),
      imageUrl: attachmentUrl(artworkFields[f.artworkPhoto])
    },
    totals: {
      price,
      paidBefore,
      newPayment,
      totalPaid,
      balance,
      priceLabel: money(price),
      paidBeforeLabel: money(paidBefore),
      newPaymentLabel: money(newPayment),
      totalPaidLabel: money(totalPaid),
      balanceLabel: money(balance)
    },
    paymentMode: paymentText(purchaseFields[f.paymentMode])
  };
}

export function invoiceFilename(data) {
  const client = data.client.name || "CLIENT";
  const artist = data.artwork.artist || "ARTISTE";
  const clean = `${data.invoiceNumber}_${client}_${artist}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `FACT_${clean}.pdf`;
}
