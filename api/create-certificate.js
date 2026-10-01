import { getBaseConfig } from "../lib/config.js";
import { airtablePatch, airtableUploadAttachment } from "../lib/airtable.js";
import { certificateFilename, loadCertificateData } from "../lib/certificate-data.js";
import { createCertificatePdf } from "../lib/certificate-pdf.js";

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

    const attachmentField = config.fields.certificateAttachment;
    if (!attachmentField) {
      throw new Error("No Airtable certificate attachment field configured.");
    }

    const data = await loadCertificateData(base, recordId);
    const filename = certificateFilename(data);
    const pdf = await createCertificatePdf(data);

    // UploadAttachment appends the new certificate and preserves existing invoice/certificate files.
    await airtableUploadAttachment(
      config.baseId,
      recordId,
      attachmentField,
      pdf,
      filename
    );

    const update = {};
    if (config.fields.certificateDone) update[config.fields.certificateDone] = true;
    if (config.fields.certificateLaunch) update[config.fields.certificateLaunch] = false;

    if (Object.keys(update).length > 0) {
      await airtablePatch(config.baseId, config.tables.purchases, recordId, update);
    }

    res.status(200).send(`Certificate generated and attached: ${filename}`);
  } catch (error) {
    if (
      error?.statusCode === 400 &&
      activeConfig?.fields?.certificateLaunch &&
      activeRecordId
    ) {
      try {
        await airtablePatch(
          activeConfig.baseId,
          activeConfig.tables.purchases,
          activeRecordId,
          { [activeConfig.fields.certificateLaunch]: false }
        );
      } catch {
        // Preserve the original validation error.
      }
    }

    res.status(error.statusCode || 500).send(error.message || "Certificate attachment failed.");
  }
}
