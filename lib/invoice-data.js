import { getBaseConfig } from "./config.js";
import { airtableGet, asText, attachmentUrl, firstLinkedRecordId, linkedRecordIds } from "./airtable.js";

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

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString("fr-FR");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR");
}

function surnameOnly(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function customsStatementsForInvoice(clientAddress, artworks) {
  const address = String(clientAddress || "").toUpperCase();
  const isUsa =
    /(^|[^A-Z])USA([^A-Z]|$)/.test(address) ||
    address.includes("UNITED STATES");

  if (!isUsa) return [];

  const kinds = new Set(
    (artworks || []).map((artwork) => {
      const technique = String(artwork?.technique || "").toUpperCase();
      return technique.includes("BRONZE") ? "bronze" : "painting";
    })
  );

  const statements = [];
  if (kinds.has("bronze")) {
    statements.push(
      "Original Artwork Bronze, Signed and Numbered by the Artist. HS Code: 9703.00. The artist is still alive and the artwork does not belong to cultural goods."
    );
  }
  if (kinds.has("painting")) {
    statements.push(
      "Original Artwork Painting, Signed by the Artist. HS Code: 9701.10. The artist is still alive and the artwork does not belong to cultural goods."
    );
  }
  return statements;
}

function artworkFromFields(fields, purchaseFields, f, options = {}) {
  const technique = fieldText(fields, f.artworkTechnique) || fieldText(purchaseFields, f.purchaseArtworkTechnique);
  return {
    title: fieldText(fields, f.artworkTitle) || fieldText(purchaseFields, f.purchaseArtworkTitle),
    artist: fieldText(fields, f.artworkArtist) || fieldText(purchaseFields, f.purchaseArtworkArtist),
    year: fieldText(fields, f.artworkYear),
    technique,
    dimensions: fieldText(fields, f.artworkDimensions) || fieldText(purchaseFields, f.purchaseArtworkDimensions),
    edition: options.includePurchaseEdition ? fieldText(purchaseFields, f.bronzeEdition) : "",
    imageUrl: attachmentUrl(fields[f.artworkPhoto]) || attachmentUrl(purchaseFields[f.purchaseArtworkPhoto])
  };
}

export async function loadInvoiceData(baseKey, recordId) {
  const config = getBaseConfig(baseKey);
  const f = config.fields;

  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const purchaseFields = purchase.fields || {};

  let taxMode = fieldText(purchaseFields, f.taxMode).toUpperCase();
  if (baseKey === "saint-tropez" && !["HT", "TTC"].includes(taxMode)) {
    taxMode = "TTC";
  } else if (!["HT", "TTC"].includes(taxMode)) {
    const error = new Error("Choisis HT ou TTC avant de lancer la facture.");
    error.statusCode = 400;
    throw error;
  }

  const clientId = firstLinkedRecordId(purchaseFields[f.clientLink]);
  const artworkIds = linkedRecordIds(purchaseFields[f.artworkLink]);

  const [client, artworkRecords] = await Promise.all([
    clientId ? airtableGet(config.baseId, config.tables.clients, clientId) : null,
    Promise.all(artworkIds.map((id) => airtableGet(config.baseId, config.tables.artworks, id)))
  ]);

  const clientFields = client?.fields || {};
  const clientName =
    fieldText(clientFields, f.clientName) ||
    fieldText(purchaseFields, f.purchaseClientName, f.newClientName);

  const purchaseDateRaw = f.purchaseDate ? purchaseFields[f.purchaseDate] : null;
  const invoiceDate = formatDate(purchaseDateRaw);

  const artworks = artworkRecords.length > 0
    ? artworkRecords.map((record, index) =>
        artworkFromFields(record.fields || {}, purchaseFields, f, {
          includePurchaseEdition: index === 0
        })
      )
    : [artworkFromFields({}, purchaseFields, f, { includePurchaseEdition: true })];

  const firstArtwork = artworks[0] || artworkFromFields({}, purchaseFields, f, { includePurchaseEdition: true });

  let invoiceNumber = f.invoiceNumber ? fieldText(purchaseFields, f.invoiceNumber) : "";

  if (baseKey === "saint-tropez") {
    const saleNumber = invoiceNumber || recordId.slice(-6).toUpperCase();
    const clientSurname = surnameOnly(clientName).toUpperCase();
    invoiceNumber = [`FACT. ${saleNumber}`, clientSurname].filter(Boolean).join(" - ");
  }

  const price = fieldNumber(purchaseFields, f.price);
  const paidBefore = fieldNumber(purchaseFields, f.paid);
  const newPayment = fieldNumber(purchaseFields, f.newPayment);
  const totalPaid = paidBefore + newPayment;
  const balance = f.balance && purchaseFields[f.balance] !== undefined
    ? Number(purchaseFields[f.balance] || 0)
    : price - totalPaid;

  const clientAddress = joinAddress([
    fieldText(clientFields, f.clientAddress) || fieldText(purchaseFields, f.newClientAddress),
    [
      fieldText(clientFields, f.clientPostcode) || fieldText(purchaseFields, f.newClientPostcode),
      fieldText(clientFields, f.clientCity) || fieldText(purchaseFields, f.newClientCity)
    ].filter(Boolean).join(" "),
    fieldText(clientFields, f.clientRegion) || fieldText(purchaseFields, f.newClientRegion),
    fieldText(clientFields, f.clientCountry) || fieldText(purchaseFields, f.newClientCountry)
  ]) || fieldText(purchaseFields, f.purchaseClientAddress);

  return {
    baseKey,
    recordId,
    invoiceNumber: invoiceNumber || recordId.slice(-6).toUpperCase(),
    date: invoiceDate,
    gallery: config.gallery,
    client: {
      name: clientName,
      address: clientAddress,
      email: fieldText(clientFields, f.clientEmail) || fieldText(purchaseFields, f.purchaseClientEmail, f.newClientEmail),
      phone: fieldText(clientFields, f.clientPhone) || fieldText(purchaseFields, f.purchaseClientPhone, f.newClientPhone)
    },
    artwork: firstArtwork,
    artworks,
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
    paymentMode: paymentText(purchaseFields[f.paymentMode]),
    taxMode: taxMode || "TTC",
    customsStatements: customsStatementsForInvoice(clientAddress, artworks)
  };
}

export function invoiceFilename(data) {
  if (data.baseKey === "saint-tropez") {
    const clean = String(data.invoiceNumber || "FACTURE")
      .replace(/^FACT\.\s*/i, "FACT ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
    return `${clean}.pdf`;
  }

  const client = data.client.name || "CLIENT";
  const artists = (data.artworks || [data.artwork])
    .map((artwork) => artwork?.artist)
    .filter(Boolean);
  const artist = artists.length > 1 ? "MULTI_OEUVRES" : artists[0] || "ARTISTE";
  const clean = `${data.invoiceNumber}_${client}_${artist}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `FACT_${clean}.pdf`;
}
