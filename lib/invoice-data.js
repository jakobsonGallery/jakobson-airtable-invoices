import { getBaseConfig } from "./config.js";
import { airtableGet, asText, attachmentUrl, firstLinkedRecordId } from "./airtable.js";

function joinAddress(parts) {
  return parts.filter(Boolean).join("\n");
}

function fieldText(fields, ...fieldIds) {
  for (const fieldId of fieldIds) {
    if (!fieldId) continue;
    const value = asText(fields[fieldId]).trim();
    if (value) return value;
  }
  return "";
}

function fieldNumber(fields, ...fieldIds) {
  for (const fieldId of fieldIds) {
    if (!fieldId) continue;
    const value = fields[fieldId];
    if (value !== null && value !== undefined && value !== "") return Number(value || 0);
  }
  return 0;
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
  const price = fieldNumber(purchaseFields, f.price);
  const paidBefore = fieldNumber(purchaseFields, f.paid);
  const newPayment = fieldNumber(purchaseFields, f.newPayment);
  const totalPaid = paidBefore + newPayment;
  const balance = f.balance && purchaseFields[f.balance] !== undefined ? Number(purchaseFields[f.balance] || 0) : price - totalPaid;

  const clientAddress = joinAddress([
    fieldText(clientFields, f.clientAddress) || fieldText(purchaseFields, f.newClientAddress),
    [
      fieldText(clientFields, f.clientPostcode) || fieldText(purchaseFields, f.newClientPostcode),
      fieldText(clientFields, f.clientCity) || fieldText(purchaseFields, f.newClientCity)
    ].filter(Boolean).join(" "),
    fieldText(clientFields, f.clientRegion) || fieldText(purchaseFields, f.newClientRegion),
    fieldText(clientFields, f.clientCountry) || fieldText(purchaseFields, f.newClientCountry)
  ]) || fieldText(purchaseFields, f.purchaseClientAddress);

  const technique = fieldText(artworkFields, f.artworkTechnique) || fieldText(purchaseFields, f.purchaseArtworkTechnique);

  return {
    baseKey,
    recordId,
    invoiceNumber: invoiceNumber || recordId.slice(-6).toUpperCase(),
    date: new Date().toLocaleDateString("fr-FR"),
    gallery: config.gallery,
    client: {
      name: fieldText(clientFields, f.clientName) || fieldText(purchaseFields, f.purchaseClientName, f.newClientName),
      address: clientAddress,
      email: fieldText(clientFields, f.clientEmail) || fieldText(purchaseFields, f.purchaseClientEmail, f.newClientEmail),
      phone: fieldText(clientFields, f.clientPhone) || fieldText(purchaseFields, f.purchaseClientPhone, f.newClientPhone)
    },
    artwork: {
      title: fieldText(artworkFields, f.artworkTitle) || fieldText(purchaseFields, f.purchaseArtworkTitle),
      artist: fieldText(artworkFields, f.artworkArtist) || fieldText(purchaseFields, f.purchaseArtworkArtist),
      year: fieldText(artworkFields, f.artworkYear),
      technique,
      dimensions: fieldText(artworkFields, f.artworkDimensions) || fieldText(purchaseFields, f.purchaseArtworkDimensions),
      edition: fieldText(purchaseFields, f.bronzeEdition),
      imageUrl: attachmentUrl(artworkFields[f.artworkPhoto]) || attachmentUrl(purchaseFields[f.purchaseArtworkPhoto])
    },
    totals: {
      price,
      paid: totalPaid,
      paidBefore,
      newPayment,
      totalPaid,
      balance,
      priceLabel: money(price),
      paidLabel: money(totalPaid),
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
