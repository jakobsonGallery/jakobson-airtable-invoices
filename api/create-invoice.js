import { getBaseConfig } from "../lib/config.js";
import { airtableGet, airtableListField, airtableListFields, airtablePatch, airtableUploadAttachment } from "../lib/airtable.js";
import { createInvoicePdf } from "../lib/pdf.js";
import { invoiceFilename, loadInvoiceData } from "../lib/invoice-data.js";
import { certificateFilename, loadCertificateData } from "../lib/certificate-data.js";
import { createCertificatePdf } from "../lib/certificate-pdf.js";

async function ensureSequentialInvoiceNumber(baseKey, config, recordId) {
  if (!config.fields.invoiceNumber) return;

  const fieldId = config.fields.invoiceNumber;
  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const current = purchase?.fields?.[fieldId];

  if (current !== null && current !== undefined && current !== "") return;

  const records =
    baseKey === "paris" && config.fields.purchaseDate
      ? await airtableListFields(config.baseId, config.tables.purchases, [
          fieldId,
          config.fields.purchaseDate
        ])
      : await airtableListField(config.baseId, config.tables.purchases, fieldId);

  const maxNumber = records.reduce((max, record) => {
    if (baseKey === "paris" && config.fields.purchaseDate) {
      const purchaseDate = record?.fields?.[config.fields.purchaseDate];
      if (!purchaseDate || String(purchaseDate) < "2026-01-01") return max;
    }
    const value = Number(record?.fields?.[fieldId]);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  await airtablePatch(config.baseId, config.tables.purchases, recordId, {
    [fieldId]: maxNumber + 1
  });
}

function assertSecret(req) {
  const url = new URL(req.url, "https://local");
  const token = url.searchParams.get("token");
  if (!process.env.INVOICE_SECRET || token !== process.env.INVOICE_SECRET) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

async function maybeCreateCertificate(base, config, recordId) {
  const f = config.fields;
  if (!f.certificateLaunch || !f.certificateDone || !f.certificateAttachment) return false;

  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const fields = purchase?.fields || {};

  const requested = fields[f.certificateLaunch] === true;
  const alreadyDone = fields[f.certificateDone] === true;

  if (!requested || alreadyDone) return false;

  const data = await loadCertificateData(base, recordId);
  const filename = certificateFilename(data);
  const pdf = await createCertificatePdf(data);

  await airtableUploadAttachment(
    config.baseId,
    recordId,
    f.certificateAttachment,
    pdf,
    filename
  );

  const update = {
    [f.certificateDone]: true,
    [f.certificateLaunch]: false
  };
  if (f.launch) update[f.launch] = false;

  await airtablePatch(config.baseId, config.tables.purchases, recordId, update);

  return filename;
}

export default async function handler(req, res) {
  let activeConfig = null;
  let activeRecordId = null;

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).send("Use POST.");
      return;
    }

    assertSecret(req);

    const url = new URL(req.url, "https://local");
    const base = url.searchParams.get("base") || "paris";
    const recordId = url.searchParams.get("recordId");

    if (!recordId) {
      res.status(400).send("Missing recordId.");
      return;
    }

    const config = getBaseConfig(base);
    activeConfig = config;
    activeRecordId = recordId;

    const certificate = await maybeCreateCertificate(base, config, recordId);
    if (certificate) {
      res.status(200).send(`Certificate generated and attached: ${certificate}`);
      return;
    }

    const attachmentField = config.fields.pdfAttachment || config.fields.fallbackAttachment;
    if (!attachmentField) {
      throw new Error("No Airtable attachment field configured.");
    }

    await ensureSequentialInvoiceNumber(base, config, recordId);
    const data = await loadInvoiceData(base, recordId);
    const filename = invoiceFilename(data);
    const pdf = await createInvoicePdf(data);

    // Only clear a dedicated invoice field. If invoices and certificates share
    // the same Airtable attachment field, preserve existing certificates.
    if (attachmentField !== config.fields.certificateAttachment) {
      await airtablePatch(config.baseId, config.tables.purchases, recordId, {
        [attachmentField]: []
      });
    }

    await airtableUploadAttachment(config.baseId, recordId, attachmentField, pdf, filename);

    const update = {};
    if (config.fields.created) update[config.fields.created] = true;
    if (config.fields.launch) update[config.fields.launch] = false;

    if (Object.keys(update).length > 0) {
      await airtablePatch(config.baseId, config.tables.purchases, recordId, update);
    }

    res.status(200).send(`Invoice generated and attached: ${filename}`);
  } catch (error) {
    if (
      error?.statusCode === 400 &&
      activeConfig?.fields?.launch &&
      activeRecordId
    ) {
      try {
        await airtablePatch(
          activeConfig.baseId,
          activeConfig.tables.purchases,
          activeRecordId,
          { [activeConfig.fields.launch]: false }
        );
      } catch {
        // Preserve the original validation error.
      }
    }

    res.status(error.statusCode || 500).send(error.message || "PDF attachment failed.");
  }
}
