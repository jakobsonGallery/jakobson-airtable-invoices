import { getBaseConfig } from "../lib/config.js";
import { airtablePatch, airtableUploadAttachment } from "../lib/airtable.js";
import { createInvoicePdf } from "../lib/pdf.js";
import { invoiceFilename, loadInvoiceData } from "../lib/invoice-data.js";

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
    const attachmentField = config.fields.pdfAttachment || config.fields.fallbackAttachment;
    if (!attachmentField) {
      throw new Error("No Airtable attachment field configured.");
    }

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
    res.status(error.statusCode || 500).send(error.message || "Invoice attachment failed.");
  }
}
