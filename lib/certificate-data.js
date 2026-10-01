import { getBaseConfig } from "./config.js";
import { airtableGet, asText, attachmentUrl, firstLinkedRecordId, linkedRecordIds } from "./airtable.js";

function fieldText(fields, ...fieldIds) {
  for (const fieldId of fieldIds) {
    if (!fieldId) continue;
    const value = asText(fields[fieldId]).trim();
    if (value) return value;
  }
  return "";
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function artworkFromFields(fields, purchaseFields, f, options = {}) {
  return {
    title: fieldText(fields, f.artworkTitle) || fieldText(purchaseFields, f.purchaseArtworkTitle),
    artist: fieldText(fields, f.artworkArtist) || fieldText(purchaseFields, f.purchaseArtworkArtist),
    year: fieldText(fields, f.artworkYear),
    technique: fieldText(fields, f.artworkTechnique) || fieldText(purchaseFields, f.purchaseArtworkTechnique),
    dimensions: fieldText(fields, f.artworkDimensions) || fieldText(purchaseFields, f.purchaseArtworkDimensions),
    edition: options.includePurchaseEdition ? fieldText(purchaseFields, f.bronzeEdition) : "",
    imageUrl: attachmentUrl(fields[f.artworkPhoto]) || attachmentUrl(purchaseFields[f.purchaseArtworkPhoto])
  };
}

function cleanFilenamePart(value, fallback) {
  const clean = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return clean || fallback;
}

export async function loadCertificateData(baseKey, recordId) {
  const config = getBaseConfig(baseKey);
  const f = config.fields;

  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const purchaseFields = purchase.fields || {};

  const clientId = firstLinkedRecordId(purchaseFields[f.clientLink]);
  const artworkIds = linkedRecordIds(purchaseFields[f.artworkLink]);

  if (artworkIds.length === 0) {
    const error = new Error("Aucune œuvre liée à cet achat.");
    error.statusCode = 400;
    throw error;
  }

  const [client, artworkRecords] = await Promise.all([
    clientId ? airtableGet(config.baseId, config.tables.clients, clientId) : null,
    Promise.all(artworkIds.map((id) => airtableGet(config.baseId, config.tables.artworks, id)))
  ]);

  const clientFields = client?.fields || {};
  const clientName =
    fieldText(clientFields, f.clientName) ||
    fieldText(purchaseFields, f.purchaseClientName, f.newClientName);

  const artworks = artworkRecords.map((record, index) =>
    artworkFromFields(record.fields || {}, purchaseFields, f, {
      includePurchaseEdition: index === 0
    })
  );

  return {
    baseKey,
    recordId,
    date: formatDate(f.purchaseDate ? purchaseFields[f.purchaseDate] : null),
    place: baseKey === "saint-tropez" ? "Saint-Tropez, France" : "Paris, France",
    gallery: config.gallery,
    collector: clientName,
    artworks
  };
}

export function certificateFilename(data) {
  const first = data.artworks?.[0] || {};
  const client = cleanFilenamePart(data.collector, "CLIENT");
  const artist = cleanFilenamePart(first.artist, "ARTISTE");
  const title = cleanFilenamePart(first.title, "OEUVRE");
  const suffix = data.artworks?.length > 1 ? "_MULTI" : "";
  return `CERTIFICAT_${client}_${artist}_${title}${suffix}.pdf`;
}
