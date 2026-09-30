import { getBaseConfig } from "../lib/config.js";
import { airtableGet, airtableListField, airtablePatch, airtableUploadAttachment } from "../lib/airtable.js";
import { createInvoicePdf } from "../lib/pdf.js";
import { invoiceFilename, loadInvoiceData } from "../lib/invoice-data.js";

async function ensureSequentialInvoiceNumber(baseKey, config, recordId) {
  if (baseKey !== "saint-tropez" || !config.fields.invoiceNumber) return;

  const fieldId = config.fields.invoiceNumber;
  const purchase = await airtableGet(config.baseId, config.tables.purchases, recordId);
  const current = purchase?.fields?.[fieldId];

  // Respect any manually entered or manually corrected invoice number.
  if (current !== null && current !== undefined && current !== "") return;

  const records = await airtableListField(config.baseId, config.tables.purchases, fieldId);
  const maxNumber = records.reduce((max, record) => {
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
    const attachmentField = config.fields.pdfAttachment || config.fields.fallbackAttachment;
    if (!attachmentField) {
      throw new Error("No Airtable attachment field configured.");
    }

    await ensureSequentialInvoiceNumber(base, config, recordId);
    const data = await loadInvoiceData(base, recordId);
    const filename = invoiceFilename(data);
    const pdf = await createInvoicePdf(data);

    await airtablePatch(config.baseId, config.tables.purchases, recordId, {
      [attachmentField]: []
    });

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

    res.status(error.statusCode || 500).send(error.message || "Invoice attachment failed.");
  }
}
